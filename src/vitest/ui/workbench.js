(() => {
  const logEl = document.getElementById('log');
  const stepStatus = document.getElementById('stepStatus');
  const stepAction = document.getElementById('stepAction');
  const rule = document.getElementById('rule');
  const pattern = document.getElementById('pattern');
  const scriptOut = document.getElementById('scriptOut');
  const resultOut = document.getElementById('resultOut');
  const ruleLast = document.getElementById('ruleLast');
  const patternLast = document.getElementById('patternLast');
  const scriptOutLast = document.getElementById('scriptOutLast');
  const resultOutLast = document.getElementById('resultOutLast');
  const sendBtn = document.getElementById('sendCustom');
  const addFromInputBtn = document.getElementById('addFromInput');
  const customText = document.getElementById('customText');
  const rulesUpdate = document.getElementById('rulesUpdate');
  const lastDoneStep = document.getElementById('lastDoneStep');
  const pendingRule = document.getElementById('pendingRule');
  const pendingPattern = document.getElementById('pendingPattern');
  const pendingScriptOut = document.getElementById('pendingScriptOut');
  const btnSave = document.getElementById('btnSave');
  const fileName = document.getElementById('fileName');
  const dirtyFlag = document.getElementById('dirtyFlag');
  const versionList = document.getElementById('versionList');
  const btnCheckout = document.getElementById('btnCheckout');
  const stepsEl = document.getElementById('steps');
  const autoAddOnSuccessEl = document.getElementById('autoAddOnSuccess');
  const newStepText = document.getElementById('newStepText');
  const newStepIndex = document.getElementById('newStepIndex');
  const btnAddStep = document.getElementById('btnAddStep');
  const continueRunningEl = document.getElementById('continueRunning');
  let currentIndex = 0;
  let continueRunning = false;  

  function log(line) {
    const div = document.createElement('div');
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function fetcher(fn) {
      let timer = null;
      const cancel = () => {
          if (timer !== null) {
              clearTimeout(timer);
              timer = null;
          }
      };
      
  const fire = (timeout) => {
      cancel();
      timer = setTimeout(() => {
          fn();
          timer = null;
      }, timeout);
  };

    return { 
        cancel,
        fire
    };
}

  // SSE events
  const es = new EventSource('/events');
  es.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      if (data.type === 'step') {
        stepStatus.textContent = `步骤 ${data.index}/${data.total}`;
        stepAction.textContent = data.action || '';
        // 记录当前索引（将 1-based 转为 0-based）
        if (typeof data.index === 'number') 
          currentIndex = Math.max(0, Number(data.index) - 1);


        ruleLast.textContent = rule.textContent || '';
        patternLast.textContent = pattern.textContent || '';
        scriptOutLast.textContent = scriptOut.textContent || '';

        rule.textContent = data.translation?.rule || '';
        pattern.textContent = data.translation?.pattern || '';
        scriptOut.textContent = data.translation?.code || '';
      } else if (data.type === 'script') {
        const txt = typeof data.script === 'string' ? data.script : JSON.stringify(data.script, null, 2);
        const prev = scriptOut.textContent || '';
        // 合并脚本输出，避免重复显示
        
        scriptOut.textContent = prev.endsWith(txt) ? prev : `${prev}\n---\n${txt}`;
        log('已发送脚本');
      } else if (data.type === 'result') {
        const txt = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
        // const prev = resultOut.textContent || '';
        resultOutLast.textContent =  txt;
        // 显示已完成的步骤信息
        if (lastDoneStep) lastDoneStep.textContent = data.step || '';
        log('收到执行结果');
        if(continueRunning && data.continueRunning){
          fetch('/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: "e" }) });
        }
      } else if (data.type === 'error') {
        log('错误: ' + data.message);
      } else if (data.type === 'log') {
        log(data.message);
      } else if (data.type === 'steps') {
        renderSteps(data.steps || []);
      } else if (data.type === 'rules_updated') {
        rulesUpdate.textContent = `已更新 (${data.file})`;
        setTimeout(() => (rulesUpdate.textContent = ''), 4000);
      } else if (data.type === 'quit') {
        log('会话已结束，正在关闭页面…');
        disableAll();
        try { window.close(); } catch {}
      }
    } catch (e) {
      log('事件解析失败: ' + e.message);
    }
  };

  // Toolbar actions
  document.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
        await fetch('/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: btn.dataset.action }) });
    });
  });

  continueRunningEl.addEventListener('change', (e) => {
    continueRunning = e.target.checked;
   
  });

  // Send custom NL/script
  sendBtn.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'nl';
    let text = customText.value.trim();
    if (!text) return;

    text = mode == "script" ? "脚本:" + text : text;
    await fetch('/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: { kind: mode, text } }) });
    // 保持输入框内容，直到用户手动修改或删除
    // 更新“即将发送脚本”预览
    if (pendingScriptOut) {
      pendingScriptOut.textContent = text;
      pendingRule.textContent = '将在执行时解析';
      pendingPattern.textContent = '将在执行时解析';
    }
  });

  const { fire, cancel} = fetcher(async ()=>{
      let text = customText.value.trim();
      if (!text) {
        rule.textContent = '';
        pattern.textContent = '';
        return;
      }
      
      try {
        const mode = document.querySelector('input[name="mode"]:checked')?.value || 'nl';
        text = mode == "script" ? "脚本:" + text : text;
        const res = await fetch('/translate_preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({kind: mode, text }) });
        const json = await res.json();
        if (!json.ok) {
          rule.textContent = '解析失败';
          pattern.textContent = '';
          return;
        }
        if (json.matchedRule) {
          rule.textContent = json.matchedRule || '';
          pattern.textContent = json.matchedPattern || '';
          scriptOut.textContent = json.code || '';
        } else {
          rule.textContent = '不能匹配规则';
          pattern.textContent = '';
          scriptOut.textContent = '';
        }
      } catch (e) {
        rule.textContent = '解析异常';
        pattern.textContent = '';
        scriptOut.textContent = '';
      }
    }); 
  // 输入变更时实时解析并在 section 显示匹配结果
  customText.addEventListener('input', async () => {
    //如果变化后超过1秒，才发送请求
     fire(500);
   
  });

  // 从输入框添加步骤（插入到当前步骤之前）
  addFromInputBtn?.addEventListener('click', async () => {
    let text = customText.value.trim();
    if (!text) return;
    try {

      const mode = document.querySelector('input[name="mode"]:checked')?.value || 'nl';
      text = mode == "script" ? "脚本:" + text : text;

      const res = await fetch('/steps/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, index: currentIndex }) });
      const json = await res.json();
      if (!json.ok) log('添加失败: ' + json.error); else {
        log(`已在第 ${currentIndex} 步之前插入新步骤`);
        await loadState();
      }
    } catch (err) {
      log('添加步骤异常: ' + (err?.message || String(err)));
    }
  });

  // Save to file (with backup)
  btnSave?.addEventListener('click', async () => {
    const res = await fetch('/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    const json = await res.json();
    if (json.ok) {
      log(`已保存，生成备份版本 v${json.version}`);
      await loadState();
    } else {
      log('保存失败: ' + json.error);
    }
  });

  // Checkout to version
  btnCheckout?.addEventListener('click', async () => {
    const v = parseInt(versionList.value, 10);
    if (!v || isNaN(v)) return;
    const res = await fetch('/versions/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: v }) });
    const json = await res.json();
    if (json.ok) {
      log(`已回滚到版本 v${v}（加载到内存，未覆盖主文件）`);
      await loadState();
    } else {
      log('回滚失败: ' + json.error);
    }
  });

  // Toggle setting: autoAddOnSuccess
  autoAddOnSuccessEl?.addEventListener('change', async () => {
    const res = await fetch('/settings/set', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'autoAddOnSuccess', value: !!autoAddOnSuccessEl.checked }) });
    const json = await res.json();
    if (!json.ok) log('设置更新失败: ' + json.error);
  });

  function disableAll() {
    document.querySelectorAll('button, input, textarea, select').forEach((el) => { el.disabled = true; });
  }

  function renderSteps(steps) {
    stepsEl.innerHTML = '';
    steps.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'row';
      item.dataset.index = String(idx);
      item.draggable = true;
      const text = document.createElement('span');
      text.textContent = `${idx + 1}. ${s}`;
      const btnDel = document.createElement('button'); btnDel.textContent = 'X'; btnDel.dataset.op = 'delete';

      item.appendChild(text);
      item.appendChild(btnDel);
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', String(idx));
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      stepsEl.appendChild(item);
    });
  }

  // Delegated click handlers for step operations
  stepsEl.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const op = target.dataset.op;
    if (!op) return;
    const item = target.closest('[data-index]');
    if (!item) return;
    const idx = parseInt(item.dataset.index || '0', 10);
    if (isNaN(idx)) return;
    try {
      if (op === 'edit') {
        const currentText = item.querySelector('span')?.textContent?.replace(/^\d+\.\s*/, '') || '';
        const next = prompt('编辑步骤（自然语言）', currentText || '');
        if (next && next.trim()) {
          const res = await fetch('/steps/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ index: idx, text: next.trim() }) });
          const json = await res.json();
          if (!json.ok) log('更新失败: ' + json.error); else await loadState();
        }
      } else if (op === 'delete') {
        if (!confirm(`确认删除第 ${idx + 1} 步？`)) return;
        const res = await fetch('/steps/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ index: idx }) });
        const json = await res.json();
        if (!json.ok) log('删除失败: ' + json.error); else await loadState();
      } else if (op === 'up') {
        const to = Math.max(0, idx - 1);
        if (to !== idx) {
          const res = await fetch('/steps/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: idx, to }) });
          const json = await res.json();
          if (!json.ok) log('上移失败: ' + json.error); else await loadState();
        }
      } else if (op === 'down') {
        const to = idx + 1;
        const res = await fetch('/steps/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: idx, to }) });
        const json = await res.json();
        if (!json.ok) log('下移失败: ' + json.error); else await loadState();
      }
    } catch (err) {
      log('操作失败: ' + (err?.message || String(err)));
    }
  });

  // Drag-and-drop reorder
  stepsEl.addEventListener('dragover', (e) => { e.preventDefault(); });
  stepsEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    const fromStr = e.dataTransfer?.getData('text/plain');
    const from = parseInt(fromStr || 'NaN', 10);
    const item = e.target instanceof HTMLElement ? e.target.closest('[data-index]') : null;
    const to = item ? parseInt(item.dataset.index || 'NaN', 10) : NaN;
    if (isNaN(from) || isNaN(to) || from === to) return;
    try {
      const res = await fetch('/steps/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to }) });
      const json = await res.json();
      if (!json.ok) log('拖拽排序失败: ' + json.error); else await loadState();
    } catch (err) {
      log('拖拽排序异常: ' + (err?.message || String(err)));
    }
  });

  // Add step
  btnAddStep?.addEventListener('click', async () => {
    const text = newStepText?.value?.trim();
    if (!text) return;
    const idxStr = newStepIndex?.value?.trim();
    const index = idxStr ? parseInt(idxStr, 10) : undefined;
    try {
      const res = await fetch('/steps/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(index !== undefined && !isNaN(index) ? { text, index } : { text }) });
      const json = await res.json();
      if (!json.ok) log('添加失败: ' + json.error); else {
        log('已添加步骤');
        newStepText.value = '';
        newStepIndex.value = '';
        await loadState();
      }
    } catch (err) {
      log('添加步骤异常: ' + (err?.message || String(err)));
    }
  });

  async function loadState() {
    const res = await fetch('/state');
    const json = await res.json();
    if (!json) return;
    fileName.textContent = json.file || '';
    dirtyFlag.textContent = json.dirty ? '(未保存改动)' : '';
    renderSteps((json.steps || []).map((s) => s.action || s));
    // 记录当前索引（0-based）
    if (typeof json.index === 'number') currentIndex = Math.max(0, Number(json.index));
    versionList.innerHTML = '';
    (json.versions || []).forEach((v) => {
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = `v${v}`;
      versionList.appendChild(opt);
    });
    if (json.settings && typeof json.settings.autoAddOnSuccess === 'boolean') {
      autoAddOnSuccessEl.checked = !!json.settings.autoAddOnSuccess;
    }
  }

  // 输入预览：更新“即将发送脚本”区域
  customText.addEventListener('input', () => {
    const text = customText.value;
    if (pendingScriptOut) {
      pendingScriptOut.textContent = text || '';
      pendingRule.textContent = text ? '将在执行时解析' : '';
      pendingPattern.textContent = text ? '将在执行时解析' : '';
    }
  });

  // Initial state
  loadState().catch(() => {});
})();