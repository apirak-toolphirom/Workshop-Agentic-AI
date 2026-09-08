(() => {
  const history = [], chat = document.querySelector('#chat'), form = document.querySelector('#form'), message = document.querySelector('#message'), provider = document.querySelector('#provider'), model = document.querySelector('#model');
  const FALLBACK_MODELS = {
    gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    'openai-compat': ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'claude-3-5-sonnet', 'llama-3.1-8b-instruct']
  };

  let config = null;

  function addBubble(role, content) { const el = document.createElement('div'); el.className = `bubble ${role}`; el.textContent = content; chat.appendChild(el); el.scrollIntoView({ block: 'nearest' }); }

  function populateModelOptions() {
    const providerKey = provider.value || config?.defaultProvider || 'gemini';
    const providerConfig = config?.providers?.[providerKey] || { models: FALLBACK_MODELS[providerKey] || FALLBACK_MODELS.gemini, defaultModel: FALLBACK_MODELS[providerKey]?.[0] || 'gemini-2.0-flash' };
    const options = providerConfig.models || [];
    const defaultValue = providerConfig.defaultModel || '';
    const previousValue = model.value;

    model.innerHTML = '<option value="">ใช้ค่า default จากระบบ</option>' + options.map((option) => `<option value="${option}">${option}</option>`).join('');

    if (defaultValue && options.includes(defaultValue)) {
      model.value = defaultValue;
    } else if (previousValue && options.includes(previousValue)) {
      model.value = previousValue;
    } else {
      model.value = '';
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch('/api/chat-config');
      if (!response.ok) throw new Error('Failed to load config');
      config = await response.json();
      if (config.defaultProvider) provider.value = config.defaultProvider;
      populateModelOptions();
    } catch (_) {
      config = null;
      populateModelOptions();
    }
  }

  provider.addEventListener('change', populateModelOptions);
  loadConfig();

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const text = message.value.trim(); if (!text) return; message.value = ''; addBubble('user', text); const button = form.querySelector('button'); button.disabled = true;
    try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, history, provider: provider.value, model: model.value }) }); const data = await response.json(); const reply = data.reply || data.error || 'ไม่พบข้อความตอบกลับ'; addBubble('assistant', reply); history.push({ role: 'user', content: text }, { role: 'assistant', content: reply }); }
    catch (_) { addBubble('assistant', 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ backend'); } finally { button.disabled = false; message.focus(); }
  });
})();