const fs = require('fs');
let text = fs.readFileSync('app/(dashboard)/settings/page.js', 'utf8');

// There is a dangling form in the JSX starting with:
// <form
//   onSubmit={handleAssignLogin}
//   className="mb-5 p-4 rounded-xl bg-surface border border-border space-y-3"
// >

let startIdx = text.indexOf('<form\n                  onSubmit={handleAssignLogin}');
if (startIdx === -1) startIdx = text.indexOf('<form\r\n                  onSubmit={handleAssignLogin}');
if (startIdx === -1) {
  console.log("Could not find start of form");
} else {
  let endIdx = text.indexOf('</form>\n              )}', startIdx);
  if (endIdx === -1) endIdx = text.indexOf('</form>\r\n              )}', startIdx);
  
  if (endIdx !== -1) {
    let toRemove = text.substring(startIdx, endIdx + '</form>\n              )}'.length);
    text = text.replace(toRemove, '');
  }
}

// Remove standard hooks for login setup
text = text.replace(/const \[showLoginSetupForm, setShowLoginSetupForm\](.*?);/g, '');
text = text.replace(/const \[loginSetupForm, setLoginSetupForm\](.*?);/g, '');
text = text.replace(/const \[assigningLogin, setAssigningLogin\](.*?);/g, '');
text = text.replace(/const \[assignLoginError, setAssignLoginError\](.*?);/g, '');
text = text.replace(/const \[assignLoginSuccess, setAssignLoginSuccess\](.*?);/g, '');

// Also remove success and error messages
text = text.replace(/\{assignLoginSuccess && \(\s*<p[^>]*>\s*\{assignLoginSuccess\}\s*<\/p>\s*\)\}/g, '');
text = text.replace(/\{assignLoginError && \(\s*<p[^>]*>\{assignLoginError\}<\/p>\s*\)\}/g, '');

fs.writeFileSync('app/(dashboard)/settings/page.js', text);
