function shiftLocalDateStr(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isLembreteDue(project, todayStr) {
  const text = String(project?.lembreteProximoDia || '').trim();
  if (!text) return false;
  const due = project.lembreteParaData;
  if (!due) return true;
  return String(todayStr) >= String(due);
}

module.exports = { shiftLocalDateStr, isLembreteDue };
