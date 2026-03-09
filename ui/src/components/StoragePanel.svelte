<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    chooseDirectoryPath,
    consolidateRoot,
    discoverSources,
    getRootConsolidationPlan,
    getRootsConfig,
    hasDesktopDirectoryPicker,
    openRootInFileManager,
    type DiscoveryAction,
    type DiscoveredNearbytesSource,
    type ReconcileSourcesResponse,
    type RootConsolidationCandidate,
    type RootsConfig,
    type RootsRuntimeSnapshot,
    type SourceConfigEntry,
    type SourceProvider,
    type StorageFullPolicy,
    type VolumeDestinationConfig,
    type VolumePolicyEntry,
    updateRootsConfig,
  } from '../lib/api.js';
  import ArmedActionButton from './ArmedActionButton.svelte';
  import VolumeIdentity from './VolumeIdentity.svelte';
  import { ArrowRightLeft, FolderOpen, HardDrive, Plus, Search, Shield, Trash2 } from 'lucide-svelte';

  let {
    mode = 'volume',
    volumeId = null,
    currentVolumePresentation = null,
    discoveryDetails = null,
    refreshToken = 0,
    focusSection = null,
  } = $props<{
    mode?: 'global' | 'volume';
    volumeId: string | null;
    currentVolumePresentation?: {
      volumeId: string;
      label: string;
      filePayload: string;
      fileMimeType: string;
      fileName: string;
    } | null;
    discoveryDetails?: ReconcileSourcesResponse | null;
    refreshToken?: number;
    focusSection?: 'discovery' | 'defaults' | null;
  }>();

  type StatusTone = 'good' | 'warn' | 'muted';

  const DISMISSED_DISCOVERY_KEY = 'nearbytes-source-discovery-dismissed-v1';
  const RESERVE_OPTIONS = [0, 5, 10, 15, 20, 25, 30];
  const DEFAULT_RESERVE_PERCENT = 5;
  const DEFAULT_DESTINATION: VolumeDestinationConfig = {
    sourceId: '',
    enabled: true,
    storeEvents: true,
    storeBlocks: true,
    copySourceBlocks: true,
    reservePercent: DEFAULT_RESERVE_PERCENT,
    fullPolicy: 'block-writes',
  };

  let configPath = $state<string | null>(null);
  let configDraft = $state<RootsConfig | null>(null);
  let runtime = $state<RootsRuntimeSnapshot | null>(null);
  let loading = $state(true);
  let errorMessage = $state('');
  let successMessage = $state('');
  let discoveryOpen = $state(false);
  let discoveryLoading = $state(false);
  let discoveredSources = $state<DiscoveredNearbytesSource[]>([]);
  let dismissedDiscoveries = $state<string[]>(loadDismissedDiscoveries());
  let mergeSourceId = $state<string | null>(null);
  let mergeCandidates = $state<RootConsolidationCandidate[]>([]);
  let mergeTargetId = $state('');
  let mergeLoading = $state(false);
  let mergeApplying = $state(false);
  let mergeMessage = $state('');
  let autosaveStatus = $state<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  let lastSavedSignature = $state('');
  let lastRefreshToken = $state(0);
  let lastFocusSection = $state<'discovery' | 'defaults' | null>(null);
  let latestDiscoverySectionElement = $state<HTMLElement | null>(null);
  let manualDiscoverySectionElement = $state<HTMLElement | null>(null);
  let defaultsSectionElement = $state<HTMLElement | null>(null);

  onMount(() => {
    void loadPanel();
  });

  $effect(() => {
    if (refreshToken === 0 || refreshToken === lastRefreshToken) return;
    lastRefreshToken = refreshToken;
    void loadPanel();
  });

  $effect(() => {
    if (!focusSection || focusSection === lastFocusSection) return;
    lastFocusSection = focusSection;
    void tick().then(() => {
      const target =
        focusSection === 'discovery'
          ? latestDiscoverySectionElement ?? manualDiscoverySectionElement
          : defaultsSectionElement;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $effect(() => {
    persistDismissedDiscoveries(dismissedDiscoveries);
  });

  $effect(() => {
    if (!configDraft || loading) return;
    const nextSignature = serializeConfig(configDraft);
    if (nextSignature === lastSavedSignature) return;
    autosaveStatus = 'pending';
    const timer = setTimeout(() => {
      void autosavePanel(nextSignature);
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  });

  function loadDismissedDiscoveries(): string[] {
    try {
      const raw = localStorage.getItem(DISMISSED_DISCOVERY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((value) => typeof value === 'string')
        .map((value) => normalizeComparablePath(value))
        .filter((value, index, values) => value !== '' && values.indexOf(value) === index);
    } catch {
      return [];
    }
  }

  function persistDismissedDiscoveries(values: string[]): void {
    try {
      localStorage.setItem(DISMISSED_DISCOVERY_KEY, JSON.stringify(values));
    } catch {
      // Ignore local storage failures.
    }
  }

  function cloneConfig(config: RootsConfig): RootsConfig {
    return {
      version: 2,
      sources: config.sources.map((source) => ({
        ...source,
        reservePercent: source.reservePercent ?? DEFAULT_RESERVE_PERCENT,
      })),
      defaultVolume: {
        destinations: config.defaultVolume.destinations.map((destination) => ({
          ...destination,
          reservePercent: destination.reservePercent ?? DEFAULT_RESERVE_PERCENT,
        })),
      },
      volumes: config.volumes.map((volume) => ({
        volumeId: volume.volumeId,
        destinations: volume.destinations.map((destination) => ({
          ...destination,
          reservePercent: destination.reservePercent ?? DEFAULT_RESERVE_PERCENT,
        })),
      })),
    };
  }

  function serializeConfig(config: RootsConfig): string {
    return JSON.stringify(config);
  }

  function normalizeComparablePath(value: string): string {
    return value.trim().replace(/\\/g, '/').replace(/\/+$/u, '').toLowerCase();
  }

  function detectProviderFromPath(value: string): SourceProvider {
    const lower = value.toLowerCase();
    if (lower.includes('dropbox')) return 'dropbox';
    if (lower.includes('onedrive')) return 'onedrive';
    if (lower.includes('icloud') || lower.includes('clouddocs') || lower.includes('mobile documents')) {
      return 'icloud';
    }
    if (lower.includes('google drive') || lower.includes('googledrive') || lower.includes('gdrive')) {
      return 'gdrive';
    }
    if (lower.includes('mega')) return 'mega';
    return 'local';
  }

  function formatProvider(provider: SourceProvider): string {
    if (provider === 'gdrive') return 'Google Drive';
    if (provider === 'dropbox') return 'Dropbox';
    if (provider === 'mega') return 'MEGA';
    if (provider === 'icloud') return 'Apple/iCloud';
    if (provider === 'onedrive') return 'OneDrive';
    return 'Local folder';
  }

  function compactPath(value: string): string {
    const normalized = value.trim().replace(/\\/g, '/');
    if (normalized === '') return 'Choose a folder';
    const parts = normalized.split('/').filter((part) => part.length > 0);
    return parts.at(-1) ?? normalized;
  }

  function formatPercent(value: number): string {
    return `${value}%`;
  }

  function formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return 'n/a';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  }

  function countLabel(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function sourceReservePercent(source: SourceConfigEntry): number {
    return Number.isFinite(source.reservePercent) ? source.reservePercent : DEFAULT_RESERVE_PERCENT;
  }

  function destinationReservePercent(destination: VolumeDestinationConfig | null): number {
    return Number.isFinite(destination?.reservePercent) ? destination!.reservePercent : DEFAULT_RESERVE_PERCENT;
  }

  function generateSourceId(provider: SourceProvider): string {
    const existing = new Set(configDraft?.sources.map((source) => source.id) ?? []);
    const prefix = `src-${provider === 'local' ? 'disk' : provider}`;
    let counter = existing.size + 1;
    while (existing.has(`${prefix}-${counter}`)) {
      counter += 1;
    }
    return `${prefix}-${counter}`;
  }

  function createSource(pathValue = ''): SourceConfigEntry {
    const provider = detectProviderFromPath(pathValue);
    return {
      id: generateSourceId(provider),
      provider,
      path: pathValue,
      enabled: true,
      writable: true,
      reservePercent: DEFAULT_RESERVE_PERCENT,
      opportunisticPolicy: 'drop-older-blocks',
    };
  }

  function sourceStatus(sourceId: string) {
    return runtime?.sources.find((entry) => entry.id === sourceId) ?? null;
  }

  function effectiveDestinations(targetVolumeId: string | null): VolumeDestinationConfig[] {
    if (!configDraft) return [];
    const merged = new Map<string, VolumeDestinationConfig>();
    for (const destination of configDraft.defaultVolume.destinations) {
      merged.set(destination.sourceId, { ...destination });
    }
    if (!targetVolumeId) {
      return Array.from(merged.values());
    }
    const explicit = configDraft.volumes.find((entry) => entry.volumeId === targetVolumeId);
    if (!explicit) {
      return Array.from(merged.values());
    }
    for (const destination of explicit.destinations) {
      merged.set(destination.sourceId, { ...destination });
    }
    return Array.from(merged.values());
  }

  function explicitVolumePolicy(targetVolumeId: string): VolumePolicyEntry | undefined {
    return configDraft?.volumes.find((entry) => entry.volumeId === targetVolumeId);
  }

  function ensureExplicitVolumePolicy(targetVolumeId: string): VolumePolicyEntry {
    if (!configDraft) {
      throw new Error('Config not loaded');
    }
    let entry = configDraft.volumes.find((volume) => volume.volumeId === targetVolumeId);
    if (entry) return entry;
    entry = {
      volumeId: targetVolumeId,
      destinations: effectiveDestinations(targetVolumeId).map((destination) => ({ ...destination })),
    };
    configDraft = {
      ...configDraft,
      volumes: [...configDraft.volumes, entry],
    };
    return configDraft.volumes[configDraft.volumes.length - 1];
  }

  function destinationFor(targetVolumeId: string | null, sourceId: string): VolumeDestinationConfig | null {
    return effectiveDestinations(targetVolumeId).find((destination) => destination.sourceId === sourceId) ?? null;
  }

  function upsertDestination(targetVolumeId: string | null, sourceId: string): void {
    if (!configDraft) return;
    if (targetVolumeId === null) {
      if (configDraft.defaultVolume.destinations.some((destination) => destination.sourceId === sourceId)) {
        return;
      }
      configDraft = {
        ...configDraft,
        defaultVolume: {
          destinations: [...configDraft.defaultVolume.destinations, { ...DEFAULT_DESTINATION, sourceId }],
        },
      };
      return;
    }

    const entry = ensureExplicitVolumePolicy(targetVolumeId);
    if (entry.destinations.some((destination) => destination.sourceId === sourceId)) {
      return;
    }
    const volumeIndex = configDraft.volumes.findIndex((volume) => volume.volumeId === targetVolumeId);
    const nextVolumes = [...configDraft.volumes];
    nextVolumes[volumeIndex] = {
      ...entry,
      destinations: [...entry.destinations, { ...DEFAULT_DESTINATION, sourceId }],
    };
    configDraft = {
      ...configDraft,
      volumes: nextVolumes,
    };
  }

  function updateDestinationField<K extends keyof VolumeDestinationConfig>(
    targetVolumeId: string | null,
    sourceId: string,
    field: K,
    value: VolumeDestinationConfig[K]
  ): void {
    if (!configDraft) return;
    upsertDestination(targetVolumeId, sourceId);
    if (targetVolumeId === null) {
      configDraft = {
        ...configDraft,
        defaultVolume: {
          destinations: configDraft.defaultVolume.destinations.map((destination) =>
            destination.sourceId === sourceId ? { ...destination, [field]: value } : destination
          ),
        },
      };
      return;
    }

    const entry = ensureExplicitVolumePolicy(targetVolumeId);
    const volumeIndex = configDraft.volumes.findIndex((volume) => volume.volumeId === targetVolumeId);
    const nextVolumes = [...configDraft.volumes];
    nextVolumes[volumeIndex] = {
      ...entry,
      destinations: entry.destinations.map((destination) =>
        destination.sourceId === sourceId ? { ...destination, [field]: value } : destination
      ),
    };
    configDraft = {
      ...configDraft,
      volumes: nextVolumes,
    };
  }

  function removeSource(sourceId: string): void {
    if (!configDraft || configDraft.sources.length <= 1) {
      errorMessage = 'Nearbytes needs at least one storage location.';
      return;
    }
    configDraft = {
      ...configDraft,
      sources: configDraft.sources.filter((source) => source.id !== sourceId),
      defaultVolume: {
        destinations: configDraft.defaultVolume.destinations.filter((destination) => destination.sourceId !== sourceId),
      },
      volumes: configDraft.volumes
        .map((volume) => ({
          ...volume,
          destinations: volume.destinations.filter((destination) => destination.sourceId !== sourceId),
        }))
        .filter((volume) => volume.destinations.length > 0),
    };
  }

  function removeVolumePolicy(targetVolumeId: string): void {
    if (!configDraft) return;
    configDraft = {
      ...configDraft,
      volumes: configDraft.volumes.filter((entry) => entry.volumeId !== targetVolumeId),
    };
  }

  function updateSourceField<K extends keyof SourceConfigEntry>(
    sourceId: string,
    field: K,
    value: SourceConfigEntry[K]
  ): void {
    if (!configDraft) return;
    configDraft = {
      ...configDraft,
      sources: configDraft.sources.map((source) => {
        if (source.id !== sourceId) return source;
        if (field === 'path') {
          const pathValue = String(value);
          return {
            ...source,
            path: pathValue,
            provider: detectProviderFromPath(pathValue),
          };
        }
        return {
          ...source,
          [field]: value,
        };
      }),
    };
  }

  function isDurableDestination(destination: VolumeDestinationConfig | null, sourceId: string): boolean {
    if (!destination || !destination.enabled) return false;
    const source = configDraft?.sources.find((entry) => entry.id === sourceId);
    if (!source || !source.enabled || !source.writable) return false;
    return (
      destination.storeEvents &&
      destination.storeBlocks &&
      destination.copySourceBlocks &&
      destination.fullPolicy === 'block-writes'
    );
  }

  function durableLocationCount(targetVolumeId: string | null): number {
    if (!configDraft) return 0;
    return configDraft.sources.filter((source) => isDurableDestination(destinationFor(targetVolumeId, source.id), source.id))
      .length;
  }

  function hasDurableDestination(targetVolumeId: string | null): boolean {
    return durableLocationCount(targetVolumeId) > 0;
  }

  function protectionTone(destination: VolumeDestinationConfig | null, sourceId: string): 'durable' | 'replica' | 'off' {
    if (!destination || !destination.enabled) return 'off';
    if (isDurableDestination(destination, sourceId)) return 'durable';
    if (keepsFullCopy(destination)) return 'replica';
    return 'off';
  }

  function protectionLabel(destination: VolumeDestinationConfig | null, sourceId: string): string {
    const tone = protectionTone(destination, sourceId);
    if (tone === 'durable') return 'Protected copy';
    if (tone === 'replica') return 'Spare copy';
    return 'Not keeping a copy';
  }

  function autosaveLabel(): string {
    if (autosaveStatus === 'saving') return 'Saving...';
    if (autosaveStatus === 'saved') return 'Saved';
    if (autosaveStatus === 'error') return 'Save failed';
    if (autosaveStatus === 'pending') return 'Saving soon';
    return 'Saved automatically';
  }

  function canRemoveAnySource(): boolean {
    return (configDraft?.sources.length ?? 0) > 1;
  }

  function keepsFullCopy(destination: VolumeDestinationConfig | null): boolean {
    return Boolean(
      destination?.enabled &&
      destination.storeEvents &&
      destination.storeBlocks &&
      destination.copySourceBlocks
    );
  }

  function setKeepFullCopy(
    targetVolumeId: string | null,
    sourceId: string,
    keepFullCopy: boolean
  ): void {
    if (!configDraft) return;
    upsertDestination(targetVolumeId, sourceId);
    const apply = (destination: VolumeDestinationConfig): VolumeDestinationConfig => {
      if (!keepFullCopy) {
        return {
          ...destination,
          enabled: false,
          storeEvents: false,
          storeBlocks: false,
          copySourceBlocks: false,
        };
      }
      return {
        ...destination,
        enabled: true,
        storeEvents: true,
        storeBlocks: true,
        copySourceBlocks: true,
      };
    };

    if (targetVolumeId === null) {
      configDraft = {
        ...configDraft,
        defaultVolume: {
          destinations: configDraft.defaultVolume.destinations.map((destination) =>
            destination.sourceId === sourceId ? apply(destination) : destination
          ),
        },
      };
      return;
    }

    const entry = ensureExplicitVolumePolicy(targetVolumeId);
    const volumeIndex = configDraft.volumes.findIndex((volume) => volume.volumeId === targetVolumeId);
    const nextVolumes = [...configDraft.volumes];
    nextVolumes[volumeIndex] = {
      ...entry,
      destinations: entry.destinations.map((destination) =>
        destination.sourceId === sourceId ? apply(destination) : destination
      ),
    };
    configDraft = {
      ...configDraft,
      volumes: nextVolumes,
    };
  }

  function canReuseOtherGuaranteedCopies(destination: VolumeDestinationConfig | null): boolean {
    return keepsFullCopy(destination) && destination?.fullPolicy === 'drop-older-blocks';
  }

  function sourceSuggestionRows(): Array<{
    source: DiscoveredNearbytesSource;
    alreadyAdded: boolean;
    dismissed: boolean;
  }> {
    if (!configDraft) return [];
    const unique = new Map<string, DiscoveredNearbytesSource>();
    for (const source of discoveredSources) {
      const key = normalizeComparablePath(source.path);
      const current = unique.get(key);
      if (!current || sourceSuggestionPriority(source.sourceType) < sourceSuggestionPriority(current.sourceType)) {
        unique.set(key, source);
      }
    }

    return Array.from(unique.values())
      .map((source) => {
        const normalized = normalizeComparablePath(source.path);
        return {
          source,
          alreadyAdded: configDraft.sources.some((entry) => normalizeComparablePath(entry.path) === normalized),
          dismissed: dismissedDiscoveries.includes(normalized),
        };
      })
      .filter((row) => !row.alreadyAdded && !row.dismissed);
  }

  function dismissedSuggestionCount(): number {
    if (!configDraft) return 0;
    const all = new Set<string>();
    for (const source of discoveredSources) {
      all.add(normalizeComparablePath(source.path));
    }
    let count = 0;
    for (const value of dismissedDiscoveries) {
      if (all.has(value)) count += 1;
    }
    return count;
  }

  function restoreDismissedSuggestions(): void {
    dismissedDiscoveries = [];
  }

  function mountedPresentationFor(targetVolumeId: string) {
    if (currentVolumePresentation?.volumeId === targetVolumeId) {
      return currentVolumePresentation;
    }
    return null;
  }

  function hasSourcePath(source: SourceConfigEntry): boolean {
    return source.path.trim() !== '';
  }

  function sourceSuggestionPriority(value: DiscoveredNearbytesSource['sourceType']): number {
    if (value === 'marker') return 0;
    if (value === 'layout') return 1;
    return 2;
  }

  function discoveryGroups(): Array<{
    provider: SourceProvider;
    items: ReconcileSourcesResponse['items'];
  }> {
    if (!discoveryDetails) return [];
    const grouped = new Map<SourceProvider, ReconcileSourcesResponse['items']>();
    for (const item of discoveryDetails.items) {
      const current = grouped.get(item.provider) ?? ([] as ReconcileSourcesResponse['items']);
      current.push(item);
      grouped.set(item.provider, current);
    }
    return Array.from(grouped.entries())
      .map(([provider, items]) => ({
        provider,
        items: [...items].sort((left, right) => left.path.localeCompare(right.path)),
      }))
      .sort((left, right) => formatProvider(left.provider).localeCompare(formatProvider(right.provider)));
  }

  function discoveryActionLabel(action: DiscoveryAction): string {
    if (action === 'added-source') return 'Added to saved locations';
    if (action === 'added-volume-target') return 'Sync enabled';
    if (action === 'available-share') return 'Needs review';
    return 'Already saved';
  }

  function discoveryKindLabel(classification: 'marker' | 'layout'): string {
    if (classification === 'marker') return 'Nearbytes page found';
    return 'Nearbytes data found';
  }

  function shortVolumeId(value: string): string {
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}...${value.slice(-6)}`;
  }

  async function openDiscoverySource(item: ReconcileSourcesResponse['items'][number]) {
    if (!item.configuredSourceId) return;
    await openSourceFolder(item.configuredSourceId);
  }

  function sortedUsageVolumes(sourceId: string) {
    const source = sourceStatus(sourceId);
    return [...(source?.usage.volumeUsages ?? [])].sort((left, right) => {
      const leftTotal = left.fileBytes + left.historyBytes;
      const rightTotal = right.fileBytes + right.historyBytes;
      if (rightTotal !== leftTotal) {
        return rightTotal - leftTotal;
      }
      return right.fileCount + right.historyFileCount - (left.fileCount + left.historyFileCount);
    });
  }

  function locationAvailability(source: SourceConfigEntry) {
    const status = sourceStatus(source.id);
    if (!source.enabled) {
      return { label: 'Turned off', tone: 'muted' as StatusTone };
    }
    if (!hasSourcePath(source)) {
      return { label: 'Choose a folder', tone: 'warn' as StatusTone };
    }
    if (status?.exists === false) {
      return { label: 'Folder missing', tone: 'warn' as StatusTone };
    }
    if (status && !status.isDirectory) {
      return { label: 'Not a folder', tone: 'warn' as StatusTone };
    }
    return { label: 'Ready', tone: 'good' as StatusTone };
  }

  function locationWriteState(source: SourceConfigEntry) {
    const status = sourceStatus(source.id);
    if (!source.writable) {
      return { label: 'Read only', tone: 'muted' as StatusTone };
    }
    if (!source.enabled) {
      return { label: 'Writing paused', tone: 'muted' as StatusTone };
    }
    if (status && status.exists && !status.canWrite) {
      return { label: 'Cannot write now', tone: 'warn' as StatusTone };
    }
    return { label: 'Can save new data', tone: 'good' as StatusTone };
  }

  function locationSummary(source: SourceConfigEntry): string {
    const status = sourceStatus(source.id);
    if (!hasSourcePath(source)) {
      return 'Choose a folder to finish setting up this storage location.';
    }
    if (!source.enabled) {
      return 'Nearbytes will ignore this location until you turn it back on.';
    }
    if (status?.exists === false) {
      return 'This folder is not available right now. Your rules stay saved, but Nearbytes cannot use it.';
    }
    if (status && !status.isDirectory) {
      return 'This path exists, but it is not a folder.';
    }
    if (source.writable && status?.canWrite === false) {
      return 'Nearbytes can read this location, but it cannot save new data here right now.';
    }
    if (source.writable) {
      return 'Nearbytes can read this location and save new encrypted data here.';
    }
    return 'Nearbytes can read this location, but it will not save new data here.';
  }

  function usageSummary(sourceId: string): string {
    const totalBytes = sourceStatus(sourceId)?.usage.totalBytes ?? 0;
    if (totalBytes <= 0) {
      return 'No Nearbytes data is stored here yet.';
    }
    return `Nearbytes is using ${formatSize(totalBytes)} in this location.`;
  }

  function protectionSummary(targetVolumeId: string | null): string {
    const count = durableLocationCount(targetVolumeId);
    if (count === 0) return 'Choose at least one protected copy';
    if (count === 1) return '1 protected copy ready';
    return `${count} protected copies ready`;
  }

  function protectionHint(targetVolumeId: string | null): string {
    if (hasDurableDestination(targetVolumeId)) {
      return targetVolumeId
        ? 'This space already has at least one writable protected copy.'
        : 'New spaces will start with at least one writable protected copy.';
    }
    return targetVolumeId
      ? 'Turn on "Keep a full copy" for at least one writable location below.'
      : 'Every new space needs at least one writable location that keeps a protected copy.';
  }

  function copyHelpText(targetVolumeId: string | null, source: SourceConfigEntry): string {
    const destination = destinationFor(targetVolumeId, source.id);
    const status = sourceStatus(source.id);
    if (!keepsFullCopy(destination)) {
      return targetVolumeId
        ? 'This space is not being kept here.'
        : 'New spaces will not keep a full copy here.';
    }
    if (!source.enabled) {
      return 'This rule is saved, but the location itself is turned off.';
    }
    if (!source.writable) {
      return 'This rule is saved, but Nearbytes cannot keep a protected copy here until writing is allowed.';
    }
    if (status?.exists === false) {
      return 'This rule is saved, but the folder is not available right now.';
    }
    if (status && status.exists && !status.canWrite) {
      return 'This rule is saved, but Nearbytes cannot write to this folder right now.';
    }
    if (canReuseOtherGuaranteedCopies(destination)) {
      return 'This is a spare full copy. If space runs low, Nearbytes may reuse it only after another protected copy exists.';
    }
    return 'This location keeps a protected full copy.';
  }

  function latestDiscoveryHeadline(): string {
    if (!discoveryDetails) return '';
    const parts: string[] = [];
    if (discoveryDetails.summary.sourcesAdded > 0) {
      parts.push(`${countLabel(discoveryDetails.summary.sourcesAdded, 'location')} added`);
    }
    if (discoveryDetails.summary.volumeTargetsAdded > 0) {
      parts.push(`${countLabel(discoveryDetails.summary.volumeTargetsAdded, 'sync rule')} enabled`);
    }
    if (parts.length === 0) {
      return 'No new storage locations were added automatically';
    }
    return parts.join(' | ');
  }

  async function loadPanel() {
    loading = true;
    errorMessage = '';
    successMessage = '';
    try {
      const response = await getRootsConfig();
      configPath = response.configPath;
      configDraft = cloneConfig(response.config);
      runtime = response.runtime;
      lastSavedSignature = serializeConfig(cloneConfig(response.config));
      autosaveStatus = 'idle';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load storage locations';
    } finally {
      loading = false;
    }
  }

  async function autosavePanel(expectedSignature: string) {
    if (!configDraft) return;
    errorMessage = '';
    autosaveStatus = 'saving';
    try {
      const response = await updateRootsConfig(configDraft);
      configPath = response.configPath;
      configDraft = cloneConfig(response.config);
      runtime = response.runtime;
      lastSavedSignature = serializeConfig(cloneConfig(response.config));
      autosaveStatus = lastSavedSignature === expectedSignature ? 'saved' : 'pending';
      successMessage = '';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to save';
      autosaveStatus = 'error';
    }
  }

  async function toggleDiscovery() {
    discoveryOpen = !discoveryOpen;
    if (!discoveryOpen) return;
    discoveryLoading = true;
    errorMessage = '';
    try {
      const response = await discoverSources();
      discoveredSources = response.sources;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to scan folders';
    } finally {
      discoveryLoading = false;
    }
  }

  async function pickFolderPath(initialPath = ''): Promise<string | null> {
    const picked = await chooseDirectoryPath(initialPath);
    return typeof picked === 'string' && picked.trim() !== '' ? picked.trim() : null;
  }

  async function addSourceCard() {
    if (!configDraft) return;
    if (hasDesktopDirectoryPicker()) {
      const selectedPath = await pickFolderPath();
      if (!selectedPath) return;
      const normalized = normalizeComparablePath(selectedPath);
      if (configDraft.sources.some((entry) => normalizeComparablePath(entry.path) === normalized)) {
        successMessage = 'That folder is already saved.';
        return;
      }
      configDraft = {
        ...configDraft,
        sources: [...configDraft.sources, createSource(selectedPath)],
      };
      successMessage = 'Storage location added.';
      return;
    }
    configDraft = {
      ...configDraft,
      sources: [...configDraft.sources, createSource()],
    };
  }

  async function chooseSourceFolder(sourceId: string): Promise<void> {
    if (!configDraft) return;
    const source = configDraft.sources.find((entry) => entry.id === sourceId);
    const selectedPath = await pickFolderPath(source?.path ?? '');
    if (!selectedPath) return;
    const normalized = normalizeComparablePath(selectedPath);
    const duplicate = configDraft.sources.find(
      (entry) => entry.id !== sourceId && normalizeComparablePath(entry.path) === normalized
    );
    if (duplicate) {
      errorMessage = 'That folder is already in your saved locations.';
      return;
    }
    updateSourceField(sourceId, 'path', selectedPath);
    successMessage = 'Folder updated.';
  }

  function addDiscoveredSource(source: DiscoveredNearbytesSource) {
    if (!configDraft) return;
    const normalized = normalizeComparablePath(source.path);
    if (configDraft.sources.some((entry) => normalizeComparablePath(entry.path) === normalized)) {
      successMessage = 'That folder is already saved.';
      return;
    }
    configDraft = {
      ...configDraft,
      sources: [...configDraft.sources, createSource(source.path)],
    };
    successMessage = `Added ${formatProvider(source.provider)} location.`;
  }

  function dismissDiscovery(source: DiscoveredNearbytesSource) {
    const normalized = normalizeComparablePath(source.path);
    if (dismissedDiscoveries.includes(normalized)) return;
    dismissedDiscoveries = [...dismissedDiscoveries, normalized];
  }

  async function openSourceFolder(sourceId: string) {
    errorMessage = '';
    successMessage = '';
    try {
      await openRootInFileManager(sourceId);
      successMessage = 'Opened folder.';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to open folder';
    }
  }

  async function startMerge(sourceId: string) {
    mergeSourceId = sourceId;
    mergeCandidates = [];
    mergeTargetId = '';
    mergeMessage = '';
    mergeLoading = true;
    try {
      const response = await getRootConsolidationPlan(sourceId);
      mergeCandidates = response.plan.candidates.filter((candidate) => candidate.eligible);
      if (mergeCandidates.length > 0) {
        mergeTargetId = mergeCandidates[0].id;
        mergeMessage = `Move ${countLabel(response.plan.source.fileCount, 'item')} from this location.`;
      } else {
        mergeMessage = 'No compatible destination is available right now.';
      }
    } catch (error) {
      mergeMessage = error instanceof Error ? error.message : 'Failed to prepare move';
    } finally {
      mergeLoading = false;
    }
  }

  function cancelMerge() {
    mergeSourceId = null;
    mergeCandidates = [];
    mergeTargetId = '';
    mergeLoading = false;
    mergeApplying = false;
    mergeMessage = '';
  }

  async function applyMerge() {
    if (!mergeSourceId || mergeTargetId.trim() === '') return;
    mergeApplying = true;
    errorMessage = '';
    successMessage = '';
    try {
      const response = await consolidateRoot(mergeSourceId, mergeTargetId);
      configPath = response.configPath;
      configDraft = cloneConfig(response.config);
      runtime = response.runtime;
      lastSavedSignature = serializeConfig(cloneConfig(response.config));
      autosaveStatus = 'saved';
      successMessage = 'Stored data moved.';
      cancelMerge();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to move data';
    } finally {
      mergeApplying = false;
    }
  }

  function clampReserve(value: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(95, parsed));
  }
</script>

{#if loading}
  <section class="storage-panel panel-surface" class:global-mode={mode === 'global'} class:volume-mode={mode === 'volume'}>
    <p class="storage-message">Loading storage locations...</p>
  </section>
{:else if configDraft}
  <section class="storage-panel panel-surface" class:global-mode={mode === 'global'} class:volume-mode={mode === 'volume'}>
    {#if mode === 'global'}
      <header class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Storage locations</p>
          <h2>Choose where Nearbytes stores encrypted data</h2>
          <p class="hero-text">
            Save the folders Nearbytes can use, then decide which ones should keep a protected copy for new spaces.
          </p>
        </div>
        <div class="hero-actions">
          <button type="button" class="panel-btn subtle" onclick={toggleDiscovery} disabled={discoveryLoading}>
            <Search size={14} strokeWidth={2} />
            <span>{discoveryOpen ? 'Hide scan' : 'Scan for folders'}</span>
          </button>
          <button type="button" class="panel-btn primary" onclick={addSourceCard}>
            <Plus size={14} strokeWidth={2} />
            <span>Add folder</span>
          </button>
          <span class="summary-pill" class:warning={autosaveStatus === 'error'}>{autosaveLabel()}</span>
        </div>
      </header>

      {#if errorMessage}
        <p class="panel-error">{errorMessage}</p>
      {/if}
      {#if successMessage}
        <p class="panel-success">{successMessage}</p>
      {/if}

      {#if discoveryDetails}
        <section class="panel-section" bind:this={latestDiscoverySectionElement}>
          <div class="section-head">
            <div>
              <p class="section-step">Latest automatic scan</p>
              <h3>{latestDiscoveryHeadline()}</h3>
              <p class="section-copy">
                Nearbytes can look for existing folders in synced services and add safe matches automatically.
              </p>
            </div>
            <div class="section-metrics">
              <span class="summary-pill">{countLabel(discoveryDetails.summary.sourcesAdded, 'location')} added</span>
              <span class="summary-pill">{countLabel(discoveryDetails.summary.volumeTargetsAdded, 'sync rule')} enabled</span>
            </div>
          </div>

          <details class="details-card" open={focusSection === 'discovery'}>
            <summary>Show scan details</summary>
            {#if discoveryDetails.items.length === 0}
              <p class="muted-copy">No Nearbytes storage locations were detected in the latest scan.</p>
            {:else}
              <div class="scan-group-list">
                {#each discoveryGroups() as group (group.provider)}
                  <section class="scan-group">
                    <div class="scan-group-head">
                      <p class="scan-group-title">{formatProvider(group.provider)}</p>
                      <span class="mini-pill">{group.items.length}</span>
                    </div>
                    <div class="scan-card-list">
                      {#each group.items as item (item.path)}
                        <article class="scan-card">
                          <div class="scan-copy">
                            <p class="scan-path">{item.path}</p>
                            <p class="scan-note">
                              {discoveryKindLabel(item.classification)}
                              {#if item.hasChannels}
                                {' | '}History found
                              {/if}
                              {#if item.hasBlocks}
                                {' | '}Files found
                              {/if}
                            </p>
                            <div class="scan-badges">
                              {#each item.actions as action (action)}
                                <span class="mini-pill">{discoveryActionLabel(action)}</span>
                              {/each}
                            </div>
                            {#if item.addedTargetVolumeIds.length > 0}
                              <p class="scan-note">
                                Sync was enabled for spaces {item.addedTargetVolumeIds.map(shortVolumeId).join(', ')}.
                              </p>
                            {/if}
                            {#if item.unknownVolumeIds.length > 0}
                              <p class="scan-note">
                                Other space folders were found here: {item.unknownVolumeIds.map(shortVolumeId).join(', ')}.
                              </p>
                            {/if}
                          </div>
                          {#if item.configuredSourceId}
                            <button type="button" class="panel-btn subtle compact" onclick={() => void openDiscoverySource(item)}>
                              <FolderOpen size={14} strokeWidth={2} />
                              <span>Open folder</span>
                            </button>
                          {/if}
                        </article>
                      {/each}
                    </div>
                  </section>
                {/each}
              </div>
            {/if}
          </details>
        </section>
      {/if}

      <section class="panel-section">
        <div class="section-head">
          <div>
            <p class="section-step">1. Saved storage locations</p>
            <h3>Add folders and decide whether Nearbytes may use them</h3>
            <p class="section-copy">
              Nearbytes reads from every location that is turned on. A writable location may also receive new encrypted data.
            </p>
          </div>
          <div class="section-metrics">
            <span class="summary-pill">{countLabel(configDraft.sources.length, 'location')} saved</span>
          </div>
        </div>

        <div class="card-grid">
          {#each configDraft.sources as source (source.id)}
            {@const status = sourceStatus(source.id)}
            {@const availability = locationAvailability(source)}
            {@const writeState = locationWriteState(source)}
            <article class="location-card">
              <div class="card-head">
                <div class="card-title">
                  <div class="card-icon">
                    <HardDrive size={16} strokeWidth={2.1} />
                  </div>
                  <div>
                    <p class="provider-label">{formatProvider(source.provider)}</p>
                    <h4>{compactPath(source.path)}</h4>
                    <p class="path-copy">{source.path || 'No folder selected yet'}</p>
                  </div>
                </div>
                <div class="card-status">
                  <span class={`status-pill tone-${availability.tone}`}>{availability.label}</span>
                  <span class={`status-pill tone-${writeState.tone}`}>{writeState.label}</span>
                </div>
              </div>

              <p class="card-copy">{locationSummary(source)}</p>

              <div class="button-row">
                <button type="button" class="panel-btn subtle compact" onclick={() => chooseSourceFolder(source.id)}>
                  <Search size={14} strokeWidth={2} />
                  <span>{hasSourcePath(source) ? 'Change folder' : 'Choose folder'}</span>
                </button>
                <button type="button" class="panel-btn subtle compact" onclick={() => openSourceFolder(source.id)} disabled={!hasSourcePath(source)}>
                  <FolderOpen size={14} strokeWidth={2} />
                  <span>Open folder</span>
                </button>
              </div>

              <div class="toggle-list">
                <label class="toggle-row">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onchange={(event) => updateSourceField(source.id, 'enabled', (event.currentTarget as HTMLInputElement).checked)}
                  />
                  <div>
                    <span class="toggle-title">Use this location</span>
                    <span class="toggle-copy">Nearbytes can read existing data here.</span>
                  </div>
                </label>
                <label class="toggle-row">
                  <input
                    type="checkbox"
                    checked={source.writable}
                    onchange={(event) => updateSourceField(source.id, 'writable', (event.currentTarget as HTMLInputElement).checked)}
                  />
                  <div>
                    <span class="toggle-title">Allow new data here</span>
                    <span class="toggle-copy">Nearbytes may save new encrypted data to this location.</span>
                  </div>
                </label>
              </div>

              <div class="fact-row">
                <span>{status?.availableBytes !== undefined ? `${formatSize(status.availableBytes)} free` : 'Free space unknown'}</span>
                <span>{usageSummary(source.id)}</span>
              </div>

              {#if status?.lastWriteFailure}
                <p class="warning-copy">Last write problem: {status.lastWriteFailure.message}</p>
              {/if}

              <details class="details-card">
                <summary>Advanced location settings</summary>
                <div class="field-grid">
                  <label class="field-block">
                    <span>Keep this much free space</span>
                    <select
                      class="panel-input"
                      value={String(sourceReservePercent(source))}
                      onchange={(event) =>
                        updateSourceField(source.id, 'reservePercent', clampReserve((event.currentTarget as HTMLSelectElement).value))}
                    >
                      {#each RESERVE_OPTIONS as option}
                        <option value={option}>{formatPercent(option)}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="field-block">
                    <span>If the drive still fills up</span>
                    <select
                      class="panel-input"
                      value={source.opportunisticPolicy}
                      onchange={(event) =>
                        updateSourceField(source.id, 'opportunisticPolicy', (event.currentTarget as HTMLSelectElement).value as StorageFullPolicy)}
                    >
                      <option value="block-writes">Stop saving new data here</option>
                      <option value="drop-older-blocks">Reuse copies protected elsewhere</option>
                    </select>
                  </label>
                </div>

                {#if sortedUsageVolumes(source.id).length > 0}
                  <div class="usage-block">
                    <p class="subheading">Spaces stored here</p>
                    <div class="usage-list">
                      {#each sortedUsageVolumes(source.id) as usage (usage.volumeId)}
                        {@const mountedPresentation = mountedPresentationFor(usage.volumeId)}
                        <div class="usage-row">
                          <div class="usage-main">
                            <VolumeIdentity
                              compact={true}
                              label={mountedPresentation ? mountedPresentation.label : shortVolumeId(usage.volumeId)}
                              secondary={mountedPresentation ? shortVolumeId(usage.volumeId) : ''}
                              title={usage.volumeId}
                              filePayload={mountedPresentation?.filePayload ?? ''}
                              fileMimeType={mountedPresentation?.fileMimeType ?? ''}
                              fileName={mountedPresentation?.fileName ?? ''}
                            />
                          </div>
                          <div class="usage-meta">
                            <span>{formatSize(usage.fileBytes + usage.historyBytes)} total</span>
                            {#if usage.fileBytes > 0}
                              <span>{formatSize(usage.fileBytes)} files</span>
                            {/if}
                            {#if usage.historyBytes > 0}
                              <span>{formatSize(usage.historyBytes)} history</span>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <div class="danger-block">
                  <p class="subheading">Move or remove this location</p>
                  <div class="button-row">
                    <button
                      type="button"
                      class="panel-btn subtle compact"
                      onclick={() => startMerge(source.id)}
                      disabled={configDraft.sources.length < 2 || !hasSourcePath(source)}
                    >
                      <ArrowRightLeft size={14} strokeWidth={2} />
                      <span>Move stored data elsewhere</span>
                    </button>
                    {#if canRemoveAnySource()}
                      <ArmedActionButton
                        class="panel-btn subtle compact danger"
                        icon={Trash2}
                        text="Remove location"
                        armed={true}
                        autoDisarmMs={3000}
                        onPress={() => removeSource(source.id)}
                      />
                    {/if}
                  </div>

                  {#if mergeSourceId === source.id}
                    <div class="merge-box">
                      {#if mergeLoading}
                        <p class="muted-copy">Checking where this data can be moved...</p>
                      {:else if mergeCandidates.length === 0}
                        <p class="muted-copy">{mergeMessage}</p>
                      {:else}
                        <p class="muted-copy">{mergeMessage}</p>
                        <select class="panel-input" bind:value={mergeTargetId}>
                          {#each mergeCandidates as candidate (candidate.id)}
                            <option value={candidate.id}>{candidate.path}</option>
                          {/each}
                        </select>
                        <div class="button-row">
                          <button type="button" class="panel-btn subtle compact" onclick={cancelMerge}>Cancel</button>
                          <button
                            type="button"
                            class="panel-btn primary compact"
                            onclick={applyMerge}
                            disabled={mergeApplying || mergeTargetId.trim() === ''}
                          >
                            <span>{mergeApplying ? 'Moving...' : 'Move data'}</span>
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </details>
            </article>
          {/each}
        </div>
      </section>

      <section class="panel-section" bind:this={defaultsSectionElement}>
        <div class="section-head">
          <div>
            <p class="section-step">2. Default protection for new spaces</p>
            <h3>Choose which locations keep a protected copy by default</h3>
            <p class="section-copy">
              These rules apply when you open a new space. You can still save different rules for a specific space later.
            </p>
          </div>
          <div class="section-metrics">
            <span class="summary-pill" class:warning={!hasDurableDestination(null)}>{protectionSummary(null)}</span>
          </div>
        </div>

        <div class="protection-banner" class:warning={!hasDurableDestination(null)}>
          <Shield size={15} strokeWidth={2} />
          <span>{protectionHint(null)}</span>
        </div>

        <div class="rule-grid">
          {#each configDraft.sources as source (source.id)}
            {@const destination = destinationFor(null, source.id)}
            <article class="rule-card" class:active={protectionTone(destination, source.id) === 'durable'}>
              <div class="card-head">
                <div class="card-title">
                  <div>
                    <p class="provider-label">{formatProvider(source.provider)}</p>
                    <h4>{compactPath(source.path)}</h4>
                    <p class="path-copy">{source.path || 'No folder selected yet'}</p>
                  </div>
                </div>
                <span class={`status-pill tone-${protectionTone(destination, source.id)}`}>{protectionLabel(destination, source.id)}</span>
              </div>

              <label class="toggle-row large-toggle">
                <input
                  type="checkbox"
                  checked={keepsFullCopy(destination)}
                  onchange={(event) => setKeepFullCopy(null, source.id, (event.currentTarget as HTMLInputElement).checked)}
                />
                <div>
                  <span class="toggle-title">Keep a full copy of new spaces here</span>
                  <span class="toggle-copy">This includes encrypted history and file data for new spaces.</span>
                </div>
              </label>

              <p class="card-copy">{copyHelpText(null, source)}</p>

              {#if keepsFullCopy(destination)}
                <div class="field-grid">
                  <label class="field-block">
                    <span>Keep this much free space</span>
                    <select
                      class="panel-input"
                      value={String(destinationReservePercent(destination))}
                      onchange={(event) =>
                        updateDestinationField(null, source.id, 'reservePercent', clampReserve((event.currentTarget as HTMLSelectElement).value))}
                    >
                      {#each RESERVE_OPTIONS as option}
                        <option value={option}>{formatPercent(option)}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="field-block">
                    <span>If this protected copy is taking too much space</span>
                    <select
                      class="panel-input"
                      value={destination?.fullPolicy ?? 'block-writes'}
                      onchange={(event) =>
                        updateDestinationField(null, source.id, 'fullPolicy', (event.currentTarget as HTMLSelectElement).value as StorageFullPolicy)}
                    >
                      <option value="block-writes">Keep this copy</option>
                      <option value="drop-older-blocks">Use another protected copy first</option>
                    </select>
                  </label>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>

      <section class="panel-section" bind:this={manualDiscoverySectionElement}>
        <div class="section-head">
          <div>
            <p class="section-step">3. Find existing Nearbytes folders</p>
            <h3>Scan Dropbox, iCloud, OneDrive, and other folders for Nearbytes data</h3>
            <p class="section-copy">
              Use this when you already have Nearbytes data somewhere else and want to add it to your saved locations.
            </p>
          </div>
          <div class="section-metrics">
            <button type="button" class="panel-btn subtle compact" onclick={toggleDiscovery} disabled={discoveryLoading}>
              <Search size={14} strokeWidth={2} />
              <span>{discoveryOpen ? 'Hide results' : 'Scan now'}</span>
            </button>
            {#if dismissedSuggestionCount() > 0}
              <button type="button" class="panel-btn subtle compact" onclick={restoreDismissedSuggestions}>
                <span>Show hidden</span>
              </button>
            {/if}
          </div>
        </div>

        {#if discoveryOpen}
          {#if discoveryLoading}
            <p class="muted-copy">Scanning folders...</p>
          {:else if sourceSuggestionRows().length === 0}
            <p class="muted-copy">No new Nearbytes folders were found.</p>
          {:else}
            <div class="scan-card-list">
              {#each sourceSuggestionRows() as row (row.source.path)}
                <article class="scan-card">
                  <div class="scan-copy">
                    <p class="provider-label">{formatProvider(row.source.provider)}</p>
                    <p class="scan-path">{row.source.path}</p>
                  </div>
                  <div class="button-row">
                    <button type="button" class="panel-btn subtle compact" onclick={() => addDiscoveredSource(row.source)}>
                      <Plus size={14} strokeWidth={2} />
                      <span>Add location</span>
                    </button>
                    <button type="button" class="panel-btn subtle compact danger" onclick={() => dismissDiscovery(row.source)}>
                      <span>Hide</span>
                    </button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        {/if}
      </section>

      {#if configPath}
        <details class="details-card minor-details">
          <summary>Configuration file</summary>
          <p class="mono-copy">{configPath}</p>
        </details>
      {/if}
    {:else}
      <header class="hero compact-hero">
        <div class="hero-copy">
          <p class="eyebrow">This space</p>
          <h2>Choose which locations keep a protected copy</h2>
          <p class="hero-text">
            Turn on at least one writable location below. These rules apply only to the current space.
          </p>
        </div>
        <div class="hero-actions">
          <button type="button" class="panel-btn subtle" onclick={toggleDiscovery} disabled={discoveryLoading}>
            <Search size={14} strokeWidth={2} />
            <span>{discoveryOpen ? 'Hide scan' : 'Scan for folders'}</span>
          </button>
          <button type="button" class="panel-btn primary" onclick={addSourceCard}>
            <Plus size={14} strokeWidth={2} />
            <span>Add folder</span>
          </button>
          <span class="summary-pill" class:warning={autosaveStatus === 'error'}>{autosaveLabel()}</span>
          {#if volumeId}
            <span class="summary-pill" class:warning={!hasDurableDestination(volumeId)}>{protectionSummary(volumeId)}</span>
          {/if}
        </div>
      </header>

      {#if errorMessage}
        <p class="panel-error">{errorMessage}</p>
      {/if}
      {#if successMessage}
        <p class="panel-success">{successMessage}</p>
      {/if}

      {#if !volumeId}
        <p class="storage-message">Open this space first, then choose which locations keep a full copy.</p>
      {:else}
        <div class="protection-banner" class:warning={!hasDurableDestination(volumeId)}>
          <Shield size={15} strokeWidth={2} />
          <span>{protectionHint(volumeId)}</span>
        </div>

        <section class="panel-section">
          <div class="section-head">
            <div>
              <p class="section-step">Saved rule for this space</p>
              <h3>{explicitVolumePolicy(volumeId) ? 'This space has its own rule' : 'This space is currently using the default rule'}</h3>
              <p class="section-copy">
                {#if explicitVolumePolicy(volumeId)}
                  Changes below are saved only for this space. Remove the custom rule to use the default rule again.
                {:else}
                  The switches below start from your default rule. Changing them will create a saved rule for this space only.
                {/if}
              </p>
            </div>
            {#if explicitVolumePolicy(volumeId)}
              <ArmedActionButton
                class="panel-btn subtle compact danger"
                icon={Trash2}
                text="Use default rules again"
                armed={true}
                autoDisarmMs={3000}
                onPress={() => removeVolumePolicy(volumeId)}
              />
            {/if}
          </div>

          <div class="rule-grid">
            {#each configDraft.sources as source (source.id)}
              {@const destination = destinationFor(volumeId, source.id)}
              {@const availability = locationAvailability(source)}
              {@const writeState = locationWriteState(source)}
              <article class="rule-card" class:active={protectionTone(destination, source.id) === 'durable'}>
                <div class="card-head">
                  <div class="card-title">
                    <div>
                      <p class="provider-label">{formatProvider(source.provider)}</p>
                      <h4>{compactPath(source.path)}</h4>
                      <p class="path-copy">{source.path || 'No folder selected yet'}</p>
                    </div>
                  </div>
                  <div class="card-status">
                    <span class={`status-pill tone-${availability.tone}`}>{availability.label}</span>
                    <span class={`status-pill tone-${writeState.tone}`}>{writeState.label}</span>
                    <span class={`status-pill tone-${protectionTone(destination, source.id)}`}>{protectionLabel(destination, source.id)}</span>
                  </div>
                </div>

                <label class="toggle-row large-toggle">
                  <input
                    type="checkbox"
                    checked={keepsFullCopy(destination)}
                    onchange={(event) => setKeepFullCopy(volumeId, source.id, (event.currentTarget as HTMLInputElement).checked)}
                  />
                  <div>
                    <span class="toggle-title">Keep a full copy of this space here</span>
                    <span class="toggle-copy">This includes encrypted history and file data for the current space.</span>
                  </div>
                </label>

                <p class="card-copy">{copyHelpText(volumeId, source)}</p>

                {#if keepsFullCopy(destination)}
                  <div class="field-grid">
                    <label class="field-block">
                      <span>Keep this much free space</span>
                      <select
                        class="panel-input"
                        value={String(destinationReservePercent(destination))}
                        onchange={(event) =>
                          updateDestinationField(volumeId, source.id, 'reservePercent', clampReserve((event.currentTarget as HTMLSelectElement).value))}
                      >
                        {#each RESERVE_OPTIONS as option}
                          <option value={option}>{formatPercent(option)}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="field-block">
                      <span>If this protected copy is taking too much space</span>
                      <select
                        class="panel-input"
                        value={destination?.fullPolicy ?? 'block-writes'}
                        onchange={(event) =>
                          updateDestinationField(volumeId, source.id, 'fullPolicy', (event.currentTarget as HTMLSelectElement).value as StorageFullPolicy)}
                      >
                        <option value="block-writes">Keep this copy</option>
                        <option value="drop-older-blocks">Use another protected copy first</option>
                      </select>
                    </label>
                  </div>
                {/if}

                <details class="details-card">
                  <summary>Manage this storage location</summary>
                  <p class="muted-copy">These settings apply to all spaces, not just the one currently open.</p>

                  <div class="button-row">
                    <button type="button" class="panel-btn subtle compact" onclick={() => chooseSourceFolder(source.id)}>
                      <Search size={14} strokeWidth={2} />
                      <span>{hasSourcePath(source) ? 'Change folder' : 'Choose folder'}</span>
                    </button>
                    <button type="button" class="panel-btn subtle compact" onclick={() => openSourceFolder(source.id)} disabled={!hasSourcePath(source)}>
                      <FolderOpen size={14} strokeWidth={2} />
                      <span>Open folder</span>
                    </button>
                  </div>

                  <div class="toggle-list">
                    <label class="toggle-row">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onchange={(event) => updateSourceField(source.id, 'enabled', (event.currentTarget as HTMLInputElement).checked)}
                      />
                      <div>
                        <span class="toggle-title">Use this location</span>
                        <span class="toggle-copy">Nearbytes can read existing data here.</span>
                      </div>
                    </label>
                    <label class="toggle-row">
                      <input
                        type="checkbox"
                        checked={source.writable}
                        onchange={(event) => updateSourceField(source.id, 'writable', (event.currentTarget as HTMLInputElement).checked)}
                      />
                      <div>
                        <span class="toggle-title">Allow new data here</span>
                        <span class="toggle-copy">Nearbytes may save new encrypted data to this location.</span>
                      </div>
                    </label>
                  </div>

                  <div class="field-grid">
                    <label class="field-block">
                      <span>Keep this much free space</span>
                      <select
                        class="panel-input"
                        value={String(sourceReservePercent(source))}
                        onchange={(event) =>
                          updateSourceField(source.id, 'reservePercent', clampReserve((event.currentTarget as HTMLSelectElement).value))}
                      >
                        {#each RESERVE_OPTIONS as option}
                          <option value={option}>{formatPercent(option)}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="field-block">
                      <span>If the drive still fills up</span>
                      <select
                        class="panel-input"
                        value={source.opportunisticPolicy}
                        onchange={(event) =>
                          updateSourceField(source.id, 'opportunisticPolicy', (event.currentTarget as HTMLSelectElement).value as StorageFullPolicy)}
                      >
                        <option value="block-writes">Stop saving new data here</option>
                        <option value="drop-older-blocks">Reuse copies protected elsewhere</option>
                      </select>
                    </label>
                  </div>

                  {#if canRemoveAnySource()}
                    <ArmedActionButton
                      class="panel-btn subtle compact danger"
                      icon={Trash2}
                      text="Remove location"
                      armed={true}
                      autoDisarmMs={3000}
                      onPress={() => removeSource(source.id)}
                    />
                  {/if}
                </details>
              </article>
            {/each}
          </div>
        </section>

        {#if discoveryOpen}
          <section class="panel-section" bind:this={manualDiscoverySectionElement}>
            <div class="section-head">
              <div>
                <p class="section-step">Scan for folders</p>
                <h3>Add an existing Nearbytes folder to this space</h3>
                <p class="section-copy">
                  If this space already exists in another synced folder, you can add that location here.
                </p>
              </div>
            </div>
            {#if discoveryLoading}
              <p class="muted-copy">Scanning folders...</p>
            {:else if sourceSuggestionRows().length === 0}
              <p class="muted-copy">No new Nearbytes folders were found.</p>
            {:else}
              <div class="scan-card-list">
                {#each sourceSuggestionRows() as row (row.source.path)}
                  <article class="scan-card">
                    <div class="scan-copy">
                      <p class="provider-label">{formatProvider(row.source.provider)}</p>
                      <p class="scan-path">{row.source.path}</p>
                    </div>
                    <div class="button-row">
                      <button type="button" class="panel-btn subtle compact" onclick={() => addDiscoveredSource(row.source)}>
                        <Plus size={14} strokeWidth={2} />
                        <span>Add location</span>
                      </button>
                      <button type="button" class="panel-btn subtle compact danger" onclick={() => dismissDiscovery(row.source)}>
                        <span>Hide</span>
                      </button>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      {/if}
    {/if}
  </section>
{/if}

<style>
  .storage-panel {
    --panel-border: rgba(111, 173, 252, 0.18);
    --panel-soft-border: rgba(111, 173, 252, 0.12);
    --panel-bg:
      radial-gradient(circle at top left, rgba(56, 189, 248, 0.09), transparent 32%),
      linear-gradient(180deg, rgba(8, 16, 30, 0.97), rgba(7, 12, 24, 0.95));
    --card-bg: rgba(10, 19, 34, 0.8);
    --card-bg-strong: rgba(12, 22, 40, 0.92);
    --text-main: rgba(241, 245, 249, 0.96);
    --text-soft: rgba(191, 219, 254, 0.78);
    --text-faint: rgba(191, 219, 254, 0.62);
    --teal: rgba(153, 246, 228, 0.96);
    --warn: rgba(254, 240, 138, 0.96);
    --danger: rgba(254, 202, 202, 0.96);
    display: grid;
    gap: 1rem;
    width: 100%;
    min-height: 0;
    padding: 1rem;
    overflow: auto;
    border: 1px solid var(--panel-border);
    border-radius: 22px;
    background: var(--panel-bg);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 18px 40px rgba(2, 6, 23, 0.18);
  }

  .hero,
  .section-head,
  .card-head,
  .card-status,
  .hero-actions,
  .button-row,
  .section-metrics,
  .scan-badges,
  .scan-group-head,
  .fact-row,
  .usage-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .hero,
  .section-head,
  .card-head,
  .scan-group-head {
    justify-content: space-between;
  }

  .hero {
    gap: 1rem;
    padding: 1rem;
    border-radius: 20px;
    border: 1px solid var(--panel-soft-border);
    background: rgba(8, 18, 34, 0.72);
  }

  .hero-copy,
  .section-head > div:first-child,
  .scan-copy,
  .usage-main {
    display: grid;
    gap: 0.35rem;
  }

  .eyebrow,
  .section-step,
  .provider-label,
  .scan-group-title {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(110, 231, 249, 0.9);
  }

  h2,
  h3,
  h4,
  .hero-text,
  .section-copy,
  .path-copy,
  .storage-message,
  .card-copy,
  .scan-note,
  .scan-path,
  .muted-copy,
  .warning-copy,
  .mono-copy {
    margin: 0;
  }

  h2,
  h3,
  h4 {
    color: var(--text-main);
  }

  h2 {
    font-size: 1.32rem;
    line-height: 1.25;
  }

  h3 {
    font-size: 1rem;
    line-height: 1.35;
  }

  h4 {
    font-size: 0.96rem;
  }

  .hero-text,
  .section-copy,
  .path-copy,
  .storage-message,
  .card-copy,
  .scan-note,
  .scan-path,
  .muted-copy {
    color: var(--text-soft);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .warning-copy {
    color: var(--warn);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .mono-copy {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.75rem;
    color: var(--text-soft);
    word-break: break-all;
  }

  .panel-section,
  .details-card,
  .location-card,
  .rule-card,
  .scan-card,
  .scan-group {
    display: grid;
    gap: 0.9rem;
    border-radius: 18px;
    border: 1px solid var(--panel-soft-border);
    background: rgba(7, 15, 29, 0.56);
  }

  .panel-section,
  .details-card {
    padding: 0.95rem;
  }

  .location-card,
  .rule-card,
  .scan-card,
  .scan-group {
    padding: 1rem;
  }

  .card-grid,
  .rule-grid,
  .scan-card-list,
  .scan-group-list {
    display: grid;
    gap: 0.9rem;
  }

  .card-grid,
  .rule-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .location-card,
  .rule-card {
    background: var(--card-bg);
  }

  .rule-card.active {
    border-color: rgba(45, 212, 191, 0.26);
    background:
      radial-gradient(circle at top left, rgba(45, 212, 191, 0.08), transparent 36%),
      var(--card-bg-strong);
  }

  .card-title {
    display: flex;
    gap: 0.8rem;
    align-items: flex-start;
  }

  .card-icon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(96, 165, 250, 0.18);
    background: rgba(14, 27, 49, 0.88);
    color: rgba(191, 219, 254, 0.9);
  }

  .summary-pill,
  .status-pill,
  .mini-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 0 0.78rem;
    border-radius: 999px;
    border: 1px solid rgba(96, 165, 250, 0.18);
    background: rgba(12, 23, 41, 0.84);
    color: rgba(219, 234, 254, 0.92);
    font-size: 0.73rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .summary-pill.warning,
  .status-pill.tone-warn {
    border-color: rgba(251, 191, 36, 0.28);
    background: rgba(72, 53, 16, 0.46);
    color: var(--warn);
  }

  .status-pill.tone-good,
  .status-pill.tone-durable {
    border-color: rgba(45, 212, 191, 0.28);
    background: rgba(9, 58, 58, 0.42);
    color: var(--teal);
  }

  .status-pill.tone-muted,
  .status-pill.tone-replica,
  .status-pill.tone-off,
  .mini-pill {
    border-color: rgba(96, 165, 250, 0.18);
    background: rgba(12, 23, 41, 0.82);
    color: rgba(191, 219, 254, 0.88);
  }

  .panel-btn,
  :global(.panel-btn) {
    min-height: 36px;
    border-radius: 12px;
    border: 1px solid rgba(96, 165, 250, 0.22);
    background: rgba(12, 24, 43, 0.84);
    color: rgba(241, 245, 249, 0.94);
    padding: 0 0.92rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.48rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      transform 120ms ease,
      background 120ms ease;
  }

  .panel-btn:hover,
  :global(.panel-btn:hover) {
    transform: translateY(-1px);
    border-color: rgba(125, 211, 252, 0.32);
  }

  .panel-btn:disabled,
  :global(.panel-btn:disabled) {
    opacity: 0.55;
    cursor: default;
    transform: none;
  }

  .panel-btn.primary,
  :global(.panel-btn.primary) {
    background: linear-gradient(135deg, rgba(14, 116, 144, 0.94), rgba(37, 99, 235, 0.9));
    border-color: rgba(103, 232, 249, 0.24);
  }

  .panel-btn.subtle,
  :global(.panel-btn.subtle) {
    background: rgba(12, 24, 43, 0.68);
  }

  .panel-btn.compact,
  :global(.panel-btn.compact) {
    min-height: 32px;
    padding: 0 0.72rem;
  }

  .panel-btn.danger,
  :global(.panel-btn.danger) {
    border-color: rgba(248, 113, 113, 0.24);
    color: rgba(254, 226, 226, 0.94);
  }

  .panel-error,
  .panel-success,
  .protection-banner {
    margin: 0;
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    border-radius: 14px;
    padding: 0.82rem 0.94rem;
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .panel-error {
    color: var(--danger);
    border: 1px solid rgba(248, 113, 113, 0.22);
    background: rgba(127, 29, 29, 0.26);
  }

  .panel-success {
    color: rgba(209, 250, 229, 0.96);
    border: 1px solid rgba(45, 212, 191, 0.22);
    background: rgba(6, 78, 59, 0.24);
  }

  .protection-banner {
    color: rgba(204, 251, 241, 0.94);
    border: 1px solid rgba(45, 212, 191, 0.18);
    background: rgba(8, 56, 49, 0.22);
  }

  .protection-banner.warning {
    color: var(--warn);
    border-color: rgba(251, 191, 36, 0.2);
    background: rgba(72, 53, 16, 0.3);
  }

  .toggle-list,
  .usage-list,
  .danger-block {
    display: grid;
    gap: 0.8rem;
  }

  .toggle-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: start;
    padding: 0.85rem 0.9rem;
    border-radius: 14px;
    border: 1px solid rgba(96, 165, 250, 0.14);
    background: rgba(12, 23, 41, 0.54);
  }

  .toggle-row input {
    margin-top: 0.22rem;
    width: 17px;
    height: 17px;
    accent-color: #14b8a6;
  }

  .toggle-row.large-toggle {
    background: rgba(13, 26, 47, 0.72);
  }

  .toggle-row > div {
    display: grid;
    gap: 0.18rem;
  }

  .toggle-title {
    color: var(--text-main);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .toggle-copy,
  .fact-row,
  .usage-meta,
  .subheading {
    color: var(--text-soft);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .fact-row {
    gap: 0.5rem 1rem;
  }

  .fact-row span,
  .usage-meta span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .subheading {
    margin: 0;
    color: rgba(224, 242, 254, 0.92);
    font-weight: 600;
  }

  .field-grid {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }

  .field-block {
    display: grid;
    gap: 0.4rem;
  }

  .field-block > span {
    color: rgba(224, 242, 254, 0.92);
    font-size: 0.79rem;
    font-weight: 600;
  }

  .panel-input {
    min-height: 38px;
    border-radius: 12px;
    border: 1px solid rgba(96, 165, 250, 0.18);
    background: rgba(10, 18, 31, 0.92);
    color: var(--text-main);
    padding: 0 0.8rem;
    font-size: 0.83rem;
  }

  .panel-input:disabled {
    opacity: 0.55;
  }

  .details-card summary {
    cursor: pointer;
    color: rgba(224, 242, 254, 0.94);
    font-size: 0.83rem;
    font-weight: 600;
    list-style: none;
  }

  .details-card summary::-webkit-details-marker {
    display: none;
  }

  .details-card summary::before {
    content: '+';
    display: inline-block;
    width: 1rem;
    color: rgba(103, 232, 249, 0.9);
  }

  .details-card[open] summary::before {
    content: '-';
  }

  .scan-card {
    grid-template-columns: 1fr auto;
    align-items: start;
  }

  .scan-group {
    background: rgba(8, 18, 33, 0.62);
  }

  .usage-row {
    display: grid;
    gap: 0.35rem 0.9rem;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 0.75rem 0.85rem;
    border-radius: 14px;
    background: rgba(12, 23, 41, 0.5);
    border: 1px solid rgba(96, 165, 250, 0.12);
  }

  .merge-box {
    display: grid;
    gap: 0.8rem;
    padding: 0.9rem;
    border-radius: 14px;
    border: 1px solid rgba(96, 165, 250, 0.14);
    background: rgba(12, 23, 41, 0.54);
  }

  .minor-details {
    background: rgba(7, 15, 29, 0.46);
  }

  .compact-hero {
    margin-bottom: 0.1rem;
  }

  @media (max-width: 760px) {
    .storage-panel {
      padding: 0.85rem;
      border-radius: 18px;
    }

    .hero,
    .section-head,
    .card-head,
    .scan-card,
    .usage-row {
      grid-template-columns: 1fr;
    }

    .hero-actions,
    .section-metrics,
    .card-status,
    .button-row,
    .usage-meta {
      width: 100%;
    }

    .button-row > :global(*),
    .hero-actions > * {
      flex: 1 1 100%;
    }
  }
</style>
