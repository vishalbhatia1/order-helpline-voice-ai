// Builds deploy/lex-fulfillment.zip (index.js + src/) for upload in the AWS Lambda console.
// Uses the system "zip" (macOS/Linux) or PowerShell Compress-Archive (Windows).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const build = path.join(root, 'deploy', 'build');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(path.join(build, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'lambda', 'index.js'), path.join(build, 'index.js'));
for (const f of ['brain.js', 'nlu.js', 'policy.js', 'orders.js', 'allocator.js']) fs.copyFileSync(path.join(root, 'src', f), path.join(build, 'src', f));
const out = path.join(root, 'deploy', 'lex-fulfillment.zip');
fs.rmSync(out, { force: true });
if (process.platform === 'win32') execSync(`powershell -Command "Compress-Archive -Path '${build}\\*' -DestinationPath '${out}'"`);
else execSync(`cd "${build}" && zip -qr "${out}" .`);
fs.rmSync(build, { recursive: true, force: true });
console.log('Built', path.relative(root, out), '- upload it in the Lambda console (Code > Upload from > .zip file).');
