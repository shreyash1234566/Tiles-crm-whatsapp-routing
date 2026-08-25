const fs = require('fs');
const content = fs.readFileSync('app/(dashboard)/settings/page.js', 'utf8');

// The file has several syntax errors due to partial removal. We will use simple replacements to fix it.

// 1. Remove openAssignLoginForm and handleAssignLogin entirely
let newContent = content.replace(/const openAssignLoginForm = \([^]*?};\n/g, () => '/* removed openAssignLoginForm */\n');
newContent = newContent.replace(/const handleAssignLogin = async \([^]*?};\n/g, () => '/* removed handleAssignLogin */\n');

// 2. Remove the dangling form for handleAssignLogin (between assignLoginError and editSuccess)
newContent = newContent.replace(/<form\s+onSubmit=\{handleAssignLogin\}[^]*?<\/form>\s*}\)/, '');

fs.writeFileSync('app/(dashboard)/settings/page.js', newContent);
