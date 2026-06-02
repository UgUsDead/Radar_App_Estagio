const fs = require('fs');
const path = require('path');
const hooksDir = path.join(process.cwd(), 'dashboard/app/hooks');
const files = fs.readdirSync(hooksDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
  const filePath = path.join(hooksDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  const searchStr = 'apiFetch(`${apiBase}';
  const fixed = content.split(searchStr).join('apiFetch(`');
  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed);
    console.log('Fixed apiBase in', file);
  }
});
