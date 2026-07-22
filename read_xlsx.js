const xlsx = require('xlsx');
const wb = xlsx.readFile('scripts/1095_ отчет.xlsx');
console.log('Sheets:', wb.SheetNames);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
console.log('Active sheet cell range:', sheet['!ref']);
