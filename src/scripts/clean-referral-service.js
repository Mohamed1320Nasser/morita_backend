const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api/referral/referral.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Remove all single-line comments (// ...)
content = content.replace(/\/\/[^\n]*/g, '');

// Remove all multi-line comments (/* ... */)
content = content.replace(/\/\*[\s\S]*?\*\//g, '');

// Remove try-catch blocks while preserving the content inside try
content = content.replace(/try\s*\{/g, '{');
content = content.replace(/\}\s*catch\s*\([^)]*\)\s*\{[^}]*logger\.error[^}]*\}\s*\}/g, '}');
content = content.replace(/\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?throw error;\s*\}/g, '}');

// Remove empty lines (more than 2 consecutive)
content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

// Remove logger.error lines
content = content.replace(/\s*logger\.error\([^)]*\);?\n?/g, '');

fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Cleaned referral.service.ts');
