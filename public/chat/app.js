(() => {
  const history = [], chat = document.querySelector('#chat'), form = document.querySelector('#form'), message = document.querySelector('#message'), provider = document.querySelector('#provider'), model = document.querySelector('#model');
  function addBubble(role, content) { const el = document.createElement('div'); el.className = `bubble ${role}`; el.textContent = content; chat.appendChild(el); el.scrollIntoView({ block: 'nearest' }); }
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const text = message.value.trim(); if (!text) return; message.value = ''; addBubble('user', text); const button = form.querySelector('button'); button.disabled = true;
    try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, history, provider: provider.value, model: model.value }) }); const data = await response.json(); const reply = data.reply || data.error || 'ไม่พบข้อความตอบกลับ'; addBubble('assistant', reply); history.push({ role: 'user', content: text }, { role: 'assistant', content: reply }); }
    catch (_) { addBubble('assistant', 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ backend'); } finally { button.disabled = false; message.focus(); }
  });
})();