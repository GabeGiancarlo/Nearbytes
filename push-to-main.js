import { execSync } from 'child_process';

try {
  console.log('Staging all changes...');
  execSync('git add -A', { stdio: 'inherit' });
  
  console.log('Committing changes...');
  try {
    execSync('git commit -m "Update project files and add UI implementation"', { stdio: 'inherit' });
  } catch (e) {
    if (e.message.includes('nothing to commit')) {
      console.log('No changes to commit');
    } else {
      throw e;
    }
  }
  
  console.log('Checking out main branch...');
  try {
    execSync('git checkout main', { stdio: 'inherit' });
  } catch (e) {
    execSync('git checkout -b main', { stdio: 'inherit' });
  }
  
  console.log('Pushing to main branch...');
  try {
    execSync('git push origin main', { stdio: 'inherit' });
  } catch (e) {
    execSync('git push -u origin main', { stdio: 'inherit' });
  }
  
  console.log('✅ Successfully pushed to GitHub main branch!');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
