import XLSX from 'xlsx';
import { readFileSync } from 'fs';

try {
  const workbook = XLSX.readFile('scripts/1095_ отчет.xlsx');
  console.log('1) мена листов:', workbook.SheetNames);
  
  // Use first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert worksheet to an array of arrays
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Search for the row containing 'дентификатор' and 'Тарифный план'
  let headerRowIndex = -1;
  let headers = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && Array.isArray(row)) {
      const rowStr = row.map(cell => cell !== null && cell !== undefined ? String(cell).trim() : '');
      const hasId = rowStr.some(c => c === 'дентификатор');
      const hasTarif = rowStr.some(c => c === 'Тарифный план');
      if (hasId && hasTarif) {
        headerRowIndex = i;
        headers = rowStr;
        break;
      }
    }
  }
  
  if (headerRowIndex !== -1) {
    console.log('2) омер строки с заголовками (1-based index):', headerRowIndex + 1);
    console.log('3) Список заголовков:', headers);
    
    // Get first 8 rows of data after header row in JSON format with headers
    const dataRows = [];
    const actualHeaders = rows[headerRowIndex];
    
    for (let i = headerRowIndex + 1; i < Math.min(rows.length, headerRowIndex + 9); i++) {
      const row = rows[i] || [];
      const rowObj = {};
      
      // We want keys to be headers, and if headers are empty or non-existent, handle appropriately
      // But typically we map index to actualHeaders[index]
      actualHeaders.forEach((header, colIdx) => {
        if (header !== null && header !== undefined && String(header).trim() !== '') {
          rowObj[String(header).trim()] = row[colIdx] !== undefined ? row[colIdx] : null;
        }
      });
      dataRows.push(rowObj);
    }
    
    console.log('4) ервые 8 строк данных в JSON:');
    console.log(JSON.stringify(dataRows, null, 2));
  } else {
    console.log('олонки "дентификатор" и "Тарифный план" не найдены.');
    console.log('ервые 20 строк листа как массивы:');
    const first20 = rows.slice(0, 20);
    console.log(JSON.stringify(first20, null, 2));
  }
} catch (error) {
  console.log('шибка при обработке файла:', error.message);
}
