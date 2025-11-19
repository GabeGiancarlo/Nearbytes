#!/bin/bash

# Comprehensive CLI Test Script for NearBytes
# Tests all commands, edge cases, and error handling

set -e

TEST_DIR="./test-cli-data"
BIN="./dist/cli/index.js"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo -e "${YELLOW}Cleaning up test data...${NC}"
    rm -rf "$TEST_DIR" test-*.txt test-*.jpg 2>/dev/null || true
}

trap cleanup EXIT

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper functions
test_pass() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    echo "  Error: $2"
    ((TESTS_FAILED++))
}

test_info() {
    echo -e "${YELLOW}→ Testing: $1${NC}"
}

# Check if binary exists
if [ ! -f "$BIN" ]; then
    echo -e "${RED}Error: Binary not found. Run 'npm run build' first.${NC}"
    exit 1
fi

echo "=========================================="
echo "NearBytes Comprehensive CLI Test Suite"
echo "=========================================="
echo ""

# Test 1: Setup command - basic
test_info "Setup command - basic"
if node "$BIN" setup --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Setup command works"
else
    test_fail "Setup command failed" "Command returned non-zero exit code"
fi

# Test 2: Setup command - invalid secret (too short)
test_info "Setup command - invalid secret (too short)"
if node "$BIN" setup --secret "short" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_fail "Setup should reject short secret" "Command should have failed"
else
    test_pass "Setup correctly rejects short secret"
fi

# Test 3: Setup command - missing required option
test_info "Setup command - missing required option"
if node "$BIN" setup --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_fail "Setup should require secret" "Command should have failed"
else
    test_pass "Setup correctly requires secret option"
fi

# Test 4: Store command - basic
test_info "Store command - basic"
echo "Hello, NearBytes!" > test-input.txt
if node "$BIN" store --file test-input.txt --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Store command works"
    # Extract event hash from output
    EVENT_HASH=$(node "$BIN" store --file test-input.txt --secret "test:password123" --data-dir "$TEST_DIR" 2>&1 | grep "Event Hash:" | awk '{print $3}')
    if [ -n "$EVENT_HASH" ]; then
        test_pass "Store command returns event hash"
    else
        test_fail "Store command should return event hash" "No event hash found in output"
    fi
else
    test_fail "Store command failed" "Command returned non-zero exit code"
fi

# Test 5: Store command - file not found
test_info "Store command - file not found"
if node "$BIN" store --file nonexistent.txt --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_fail "Store should reject nonexistent file" "Command should have failed"
else
    test_pass "Store correctly rejects nonexistent file"
fi

# Test 6: Store command - missing options
test_info "Store command - missing file option"
if node "$BIN" store --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_fail "Store should require file option" "Command should have failed"
else
    test_pass "Store correctly requires file option"
fi

# Test 7: List command - basic
test_info "List command - basic"
if node "$BIN" list --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "List command works"
else
    test_fail "List command failed" "Command returned non-zero exit code"
fi

# Test 8: List command - JSON format
test_info "List command - JSON format"
OUTPUT=$(node "$BIN" list --secret "test:password123" --data-dir "$TEST_DIR" --format json 2>&1)
if echo "$OUTPUT" | grep -q '"events"'; then
    test_pass "List command supports JSON format"
else
    test_fail "List command JSON format" "Output doesn't contain expected JSON structure"
fi

# Test 9: List command - plain format
test_info "List command - plain format"
OUTPUT=$(node "$BIN" list --secret "test:password123" --data-dir "$TEST_DIR" --format plain 2>&1)
if [ -n "$OUTPUT" ]; then
    test_pass "List command supports plain format"
else
    test_fail "List command plain format" "No output produced"
fi

# Test 10: Retrieve command - basic (if we have an event hash)
test_info "Retrieve command - basic"
if [ -n "$EVENT_HASH" ]; then
    if node "$BIN" retrieve --event "$EVENT_HASH" --secret "test:password123" --output test-output.txt --data-dir "$TEST_DIR" > /dev/null 2>&1; then
        if [ -f test-output.txt ]; then
            if diff -q test-input.txt test-output.txt > /dev/null 2>&1; then
                test_pass "Retrieve command works and data matches"
            else
                test_fail "Retrieved data doesn't match original" "Files differ"
            fi
        else
            test_fail "Retrieve should create output file" "Output file not created"
        fi
    else
        test_fail "Retrieve command failed" "Command returned non-zero exit code"
    fi
else
    echo -e "${YELLOW}  Skipping retrieve test (no event hash available)${NC}"
fi

# Test 11: Retrieve command - invalid event hash
test_info "Retrieve command - invalid event hash"
if node "$BIN" retrieve --event "invalid-hash" --secret "test:password123" --output test-output.txt --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_fail "Retrieve should reject invalid hash" "Command should have failed"
else
    test_pass "Retrieve correctly rejects invalid hash"
fi

# Test 12: Retrieve command - missing options
test_info "Retrieve command - missing event option"
if node "$BIN" retrieve --secret "test:password123" --output test-output.txt --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_fail "Retrieve should require event option" "Command should have failed"
else
    test_pass "Retrieve correctly requires event option"
fi

# Test 13: Store multiple files
test_info "Store multiple files"
echo "File 1 content" > test-file1.txt
echo "File 2 content" > test-file2.txt
if node "$BIN" store --file test-file1.txt --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1 && \
   node "$BIN" store --file test-file2.txt --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Store multiple files works"
    EVENT_COUNT=$(node "$BIN" list --secret "test:password123" --data-dir "$TEST_DIR" --format json 2>&1 | grep -o '"hash"' | wc -l)
    if [ "$EVENT_COUNT" -ge 2 ]; then
        test_pass "Multiple events are stored correctly"
    else
        test_fail "Multiple events storage" "Expected at least 2 events, found $EVENT_COUNT"
    fi
else
    test_fail "Store multiple files failed" "Command returned non-zero exit code"
fi

# Test 14: Different secrets create different channels
test_info "Different secrets create different channels"
if node "$BIN" setup --secret "channel2:password456" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Different secrets create separate channels"
else
    test_fail "Different secrets channel creation" "Command failed"
fi

# Test 15: Wrong secret for retrieve
test_info "Wrong secret for retrieve"
if [ -n "$EVENT_HASH" ]; then
    if node "$BIN" retrieve --event "$EVENT_HASH" --secret "wrong:secret" --output test-wrong.txt --data-dir "$TEST_DIR" > /dev/null 2>&1; then
        test_fail "Retrieve should fail with wrong secret" "Command should have failed"
    else
        test_pass "Retrieve correctly fails with wrong secret"
    fi
else
    echo -e "${YELLOW}  Skipping wrong secret test (no event hash available)${NC}"
fi

# Test 16: Empty file storage
test_info "Store empty file"
touch test-empty.txt
if node "$BIN" store --file test-empty.txt --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Store empty file works"
else
    test_fail "Store empty file failed" "Command returned non-zero exit code"
fi

# Test 17: Large file storage (1MB)
test_info "Store large file (1MB)"
dd if=/dev/urandom of=test-large.bin bs=1024 count=1024 > /dev/null 2>&1
if node "$BIN" store --file test-large.bin --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Store large file works"
else
    test_fail "Store large file failed" "Command returned non-zero exit code"
fi

# Test 18: Binary file storage
test_info "Store binary file"
echo -n -e "\x00\x01\x02\x03\xFF\xFE\xFD" > test-binary.bin
if node "$BIN" store --file test-binary.bin --secret "test:password123" --data-dir "$TEST_DIR" > /dev/null 2>&1; then
    test_pass "Store binary file works"
else
    test_fail "Store binary file failed" "Command returned non-zero exit code"
fi

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi

