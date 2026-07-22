const fs = require('fs');
const file = 'apps/frontend/src/views/Leads.tsx';
const content = fs.readFileSync(file, 'utf-8');

const startMarker = '<Modal\\n        title="新增线索"';
const endMarker = '</Form>\\n      </Modal>';

const startIndex = content.indexOf('<Modal\n        title="新增线索"');
let result = content;

if (startIndex !== -1) {
  // Find the exact closing tag for this Modal
  // It's followed by <Modal title={<b>批量导入线索</b>}
  const nextModalIndex = content.indexOf('<Modal\n        title={<b>批量导入线索</b>}');
  
  if (nextModalIndex !== -1) {
    // We want to replace from startIndex up to just before nextModalIndex
    const toReplace = content.substring(startIndex, nextModalIndex);
    const newComponent = `      <LeadAddModal 
        open={isModalOpen} 
        onCancel={() => setIsModalOpen(false)} 
        onSuccess={() => { setIsModalOpen(false); fetchLeads(); }} 
      />\n\n      `;
    result = content.substring(0, startIndex) + newComponent + content.substring(nextModalIndex);
    fs.writeFileSync(file, result);
    console.log('Successfully updated Leads.tsx');
  } else {
    console.log('Could not find next Modal');
  }
} else {
  console.log('Could not find start marker');
}
