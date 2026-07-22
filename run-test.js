const fs = require('fs');
const content = fs.readFileSync('/Users/nickni/Desktop/车和网CRM 销售系统/apps/frontend/src/views/CustomerDetail.tsx', 'utf-8');
console.log(content.slice(0, 500));
