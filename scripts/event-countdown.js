/* Local-only event countdowns. Calendar arithmetic and schema live in countdown-core. */
(() => {
  'use strict';
  const WORDS = {
    zh_TW: {title:'重要日子',manage:'管理倒數',close:'關閉',add:'新增日子',edit:'編輯',remove:'刪除',save:'儲存',cancel:'取消',undo:'復原上次刪除',enabled:'在首頁顯示倒數',empty:'加入特考日期、紀念日，或值得期待的日子。',name:'名稱',date:'日期',category:'類別',emoji:'圖示（最多 8 個字元）',color:'色彩',annual:'每年重複（西曆）',annualHelp:'每年以西曆同月同日計算；2 月 29 日在非閏年以 2 月 28 日計算。',exam:'特考',anniversary:'紀念日',custom:'自訂',lavender:'薰衣草',blue:'藍色',green:'綠色',peach:'蜜桃',rose:'玫瑰',today:'就是今天',future:'還有 {n} 天',past:'已過 {n} 天',nextDate:'下次 {date} · 每年',zone:'依本機時區：',confirm:'確定刪除「{name}」？可復原上次刪除，下一次刪除會取代復原紀錄。',confirmDelete:'確定刪除',invalid:'請輸入有效的名稱、日期與圖示。名稱最多 80 字，圖示最多 8 字。',limit:'最多可儲存 30 個日子。',corrupt:'倒數資料格式有誤，原始資料已保留。請先從備份還原有效資料。',storage:'無法讀寫本機儲存空間。資料未儲存，請確認空間與瀏覽器設定。',stale:'其他分頁已更新資料。你的草稿仍保留；請先取消編輯，再重新編輯最新資料。',saved:'已儲存',deleted:'已刪除，可復原上次刪除。',restored:'已復原',local:'資料僅儲存在此瀏覽器。',count:'{n} / 30 個日子',editTitle:'編輯日子'},
    en: {title:'Important days',manage:'Manage countdowns',close:'Close',add:'Add a day',edit:'Edit',remove:'Delete',save:'Save',cancel:'Cancel',undo:'Undo last deletion',enabled:'Show countdowns on homepage',empty:'Add an exam, anniversary, or a day to look forward to.',name:'Name',date:'Date',category:'Category',emoji:'Icon (up to 8 characters)',color:'Color',annual:'Repeat annually (Gregorian)',annualHelp:'Repeats on the same Gregorian month and day. February 29 is observed on February 28 in non-leap years.',exam:'Exam',anniversary:'Anniversary',custom:'Custom',lavender:'Lavender',blue:'Blue',green:'Green',peach:'Peach',rose:'Rose',today:'Today is the day',future:'{n} days to go',past:'{n} days ago',nextDate:'Next {date} · annually',zone:'Local time zone: ',confirm:'Delete “{name}”? You can undo the last deletion; the next deletion replaces that recovery record.',confirmDelete:'Confirm deletion',invalid:'Enter a valid name, date and icon. Names allow 80 characters and icons allow 8.',limit:'You can save up to 30 days.',corrupt:'Countdown data is invalid. The original data has been preserved. Restore valid data from a backup first.',storage:'Local storage is unavailable or full. Changes were not saved; check space and browser settings.',stale:'Another tab updated the data. Your draft is preserved. Cancel editing, then reopen the latest entry before saving.',saved:'Saved',deleted:'Deleted. You can undo the last deletion.',restored:'Restored',local:'Data stays in this browser only.',count:'{n} / 30 days',editTitle:'Edit day'}
  };
  const t = (key, params = {}) => {
    let language = 'zh_TW';
    try { language = typeof currentLanguage !== 'undefined' ? currentLanguage : (localStorage.getItem('selectedLanguage') || 'zh_TW'); } catch (_) { /* defaults */ }
    const dictionaries = typeof translations !== 'undefined' ? translations : {};
    let value = dictionaries[language]?.['countdown_'+key] || dictionaries.en?.['countdown_'+key] || (WORDS[language] || WORDS.en)[key] || WORDS.en[key] || key;
    Object.entries(params).forEach(([k,v]) => { value = value.replace(`{${k}}`, String(v)); });
    return value;
  };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const button = (text, action, cls) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; };
  let core, state, raw = null, blocked = false, draft = null, draftRaw, stale = false, returnFocus, timer;
  let card, dialog, list, status, form, confirmBox, enable, add, undo, title, close;
  const fields = {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const message = (key, error = false) => { status.textContent = key ? t(key) : ''; status.classList.toggle('is-error', error); };
  function valid(value) { const result = core.validate(value); if (result === false || result === null || result?.ok === false) throw new Error('invalid'); return result && typeof result === 'object' && result.version === 1 ? result : value; }
  function read() {
    try {
      const value = localStorage.getItem(core.KEY);
      let next;
      if (value === null) {
        next = core.defaultState();
        const legacy = localStorage.getItem('myntExamDate');
        if (legacy) { try { next = core.migrateLegacy(legacy) || next; } catch (_) { /* Invalid legacy is left untouched. */ } }
      } else next = valid(JSON.parse(value));
      state = next; raw = value; blocked = false;
      if (value === null && next.events.length && localStorage.getItem(core.KEY) === null) { const migrated = JSON.stringify(valid(next)); localStorage.setItem(core.KEY, migrated); raw = migrated; }
      return true;
    } catch (error) { blocked = true; if (!state) state = core.defaultState(); message(error instanceof SyntaxError || error instanceof TypeError || error.message === 'invalid' ? 'corrupt' : 'storage', true); return false; }
  }
  function write(next, success) {
    if (blocked) return false;
    try {
      if (localStorage.getItem(core.KEY) !== raw || (draft && (stale || draftRaw !== raw))) { stale = true; message('stale', true); return false; }
      next.revision = state.revision + 1;
      next = valid(next);
      const value = JSON.stringify(next);
      localStorage.setItem(core.KEY, value);
      state = next; raw = value; message(success || 'saved'); return true;
    } catch (_) { message('storage', true); return false; }
  }
  function dayLabel(event) { const info = core.dayInfo(event, new Date()); return t(info.days === 0 ? 'today' : info.days > 0 ? 'future' : 'past', {n:Math.abs(info.days)}); }
  function zone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; } }
  function eventRow(event, actions) {
    const row = el('li', 'event-countdown-row'); row.dataset.color = event.color; row.dataset.state = core.dayInfo(event, new Date()).kind;
    const icon = el('span', 'event-countdown-icon', event.emoji); icon.setAttribute('aria-hidden','true');
    const details = el('div', 'event-countdown-details'); details.append(el('strong','',event.name),el('span','event-countdown-meta',`${t(event.category)} · ${event.annual ? t('nextDate',{date:core.dayInfo(event,new Date()).date}) : event.date}`));
    const days = el('strong','event-countdown-days',dayLabel(event));
    row.append(icon, details, days);
    if (actions) { const controls = el('div','event-countdown-actions'); const edit = button(t('edit'), () => startEdit(event), ''); edit.setAttribute('aria-label',`${t('edit')} ${event.name}`); const remove = button(t('remove'), () => askDelete(event), ''); remove.setAttribute('aria-label',`${t('remove')} ${event.name}`); edit.disabled = remove.disabled = blocked || !!draft; controls.append(edit,remove); row.append(controls); }
    return row;
  }
  function render() {
    card.replaceChildren(); card.hidden = blocked || !state.enabled || !state.events.length;
    if (!card.hidden) { const head = el('div','event-countdown-head'); head.append(el('h2','',t('title')),button(t('manage'),open)); card.append(head); const items = el('ul','event-countdown-items'); core.sortEvents(state.events,new Date()).slice(0,3).forEach(e => items.append(eventRow(e,false))); card.append(items,el('p','event-countdown-zone',t('zone')+zone())); }
    if (!dialog.open) return;
    title.textContent = t('manage'); close.textContent = t('close');
    enable.checked = state.enabled; enable.disabled = blocked || !!draft;
    document.getElementById('eventCountdownEnableLabel').textContent = t('enabled');
    document.getElementById('eventCountdownCount').textContent = t('count',{n:state.events.length});
    add.textContent = t('add'); add.disabled = blocked || !!draft || state.events.length >= 30;
    undo.textContent = t('undo'); undo.hidden = !state.deleted; undo.disabled = blocked || !!draft || state.events.length >= 30;
    list.replaceChildren(); core.sortEvents(state.events,new Date()).forEach(e => list.append(eventRow(e,true)));
    if (!state.events.length) list.append(el('li','event-countdown-empty',t('empty')));
  }
  function cancelEdit() { draft = null; stale = false; form.hidden = true; confirmBox.hidden = true; read(); if (!blocked) message(''); render(); add.focus(); }
  function startEdit(event) {
    draft = event ? copy(event) : {id:`e-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,name:'',date:'',category:'exam',emoji:'📚',color:'lavender',annual:false};
    draftRaw = raw; stale = false; message(''); confirmBox.hidden = true; form.hidden = false;
    document.getElementById('eventCountdownEditTitle').textContent = t(event ? 'editTitle' : 'add');
    Object.entries(fields).forEach(([key,input]) => { if (input.type === 'checkbox') input.checked = draft[key]; else input.value = draft[key]; });
    render(); fields.name.focus();
  }
  function askDelete(event) {
    draft = {deleteId:event.id}; draftRaw = raw; stale = false; message(''); form.hidden = true; confirmBox.replaceChildren(); confirmBox.hidden = false;
    confirmBox.append(el('p','',t('confirm',{name:event.name})));
    const cancel = button(t('cancel'),cancelEdit); const yes = button(t('confirmDelete'), () => { const next = copy(state), index = next.events.findIndex(e => e.id === event.id); if (index < 0) return message('stale',true); next.deleted = {event:next.events[index],index}; next.events.splice(index,1); if (write(next,'deleted')) { draft = null; confirmBox.hidden = true; render(); undo.focus(); } },'event-countdown-danger');
    confirmBox.append(cancel,yes); render(); cancel.focus();
  }
  function open() { if (dialog.open) return; returnFocus = document.activeElement; read(); draft = null; stale = false; form.hidden = confirmBox.hidden = true; if (!blocked) message(''); dialog.showModal(); render(); close.focus(); }
  function schedule() { clearTimeout(timer); if(document.visibilityState==='hidden') return; const now = new Date(), next = new Date(now); next.setHours(24,0,0,80); timer = setTimeout(() => { render(); schedule(); }, Math.max(100,next-now)); }
  function init() {
    core = window.MYNTCountdownCore; card = document.getElementById('eventCountdownCard'); if (!core || !card) return;
    card.classList.add('event-countdown-card');
    dialog = el('dialog','event-countdown-dialog'); dialog.id = 'eventCountdownDialog'; dialog.setAttribute('aria-labelledby','eventCountdownTitle');
    const head = el('div','event-countdown-head'); title = el('h2','',t('manage')); title.id='eventCountdownTitle'; close = button(t('close'),()=>dialog.close()); head.append(title,close);
    status = el('p','event-countdown-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    const toggle = el('label','event-countdown-toggle'); enable=el('input'); enable.type='checkbox'; enable.id='eventCountdownEnabled'; const label=el('span','',t('enabled')); label.id='eventCountdownEnableLabel'; toggle.append(enable,label);
    enable.addEventListener('change',()=>{ const next=copy(state); next.enabled=enable.checked; write(next); render(); });
    const toolbar=el('div','event-countdown-toolbar'); add=button(t('add'),()=>startEdit(),'event-countdown-primary'); add.id='eventCountdownAdd'; undo=button(t('undo'),()=>{ const next=copy(state); if (!next.deleted || next.events.length>=30) return; next.events.splice(Math.min(next.deleted.index,next.events.length),0,next.deleted.event); next.deleted=null; if(write(next,'restored')) { render(); (add.disabled ? close : add).focus(); } }); undo.id='eventCountdownUndo'; toolbar.append(add,undo);
    const count=el('p','event-countdown-meta'); count.id='eventCountdownCount'; list=el('ul','event-countdown-items');
    form=el('form','event-countdown-form'); form.hidden=true; const editTitle=el('h3'); editTitle.id='eventCountdownEditTitle'; form.append(editTitle);
    ['name','date','category','emoji','color','annual'].forEach(key=>{
      const wrapper=el('label',key==='annual'?'event-countdown-toggle':'event-countdown-field'); wrapper.dataset.field = key; const label=el('span','',t(key)); let input;
      if (key==='category'||key==='color') { input=el('select'); (key==='category'?['exam','anniversary','custom']:['lavender','blue','green','peach','rose']).forEach(value=>{const option=el('option','',t(value));option.value=value;input.append(option);}); }
      else { input=el('input'); input.type=key==='annual'?'checkbox':key==='date'?'date':'text'; if(key==='name'||key==='emoji'){input.maxLength=key==='name'?160:16;input.required=key==='name';} if(key==='date') {input.required=true;input.min='1900-01-01';input.max='2199-12-31';} }
      input.id=`eventCountdown-${key}`; fields[key]=input; if(key==='annual') wrapper.append(input,label); else wrapper.append(label,input); form.append(wrapper);
    });
    const help=el('p','event-countdown-help',t('annualHelp')); help.id='eventCountdownAnnualHelp'; fields.annual.setAttribute('aria-describedby',help.id); form.append(help);
    const formActions=el('div','event-countdown-actions'); const save=el('button','event-countdown-primary',t('save')); save.type='submit'; formActions.append(button(t('cancel'),cancelEdit),save); form.append(formActions);
    form.addEventListener('submit',event=>{ event.preventDefault(); if(!draft || draft.deleteId) return; const item={...draft}; Object.entries(fields).forEach(([key,input])=>{item[key]=input.type==='checkbox'?input.checked:input.value.trim();}); const next=copy(state), index=next.events.findIndex(e=>e.id===item.id); if(index<0 && next.events.length>=30) return message('limit',true); if(index<0) next.events.push(item); else next.events[index]=item; try { valid(next); } catch (_) { return message('invalid',true); } if(write(next)){draft=null; form.hidden=true;render();add.focus();} });
    confirmBox=el('section','event-countdown-confirm'); confirmBox.hidden=true; confirmBox.setAttribute('aria-label',t('remove'));
    dialog.append(head,el('p','event-countdown-help',t('local')),toggle,status,toolbar,count,form,confirmBox,list); document.body.append(dialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(draft)cancelEdit();else dialog.close();});
    dialog.addEventListener('close',()=>{draft=null;form.hidden=confirmBox.hidden=true;(returnFocus?.isConnected ? returnFocus : (!card.hidden ? card.querySelector('button') : document.getElementById('eventCountdownManage')))?.focus();});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();return;}if(event.key!=='Tab')return;const nodes=[...dialog.querySelectorAll('button,input,select,[tabindex]')].filter(n=>!n.disabled&&n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
    document.getElementById('eventCountdownManage')?.addEventListener('click',open);
    window.addEventListener('storage',event=>{if(event.key!==core.KEY&&event.key!==null)return;if(draft){stale=true;message('stale',true);}read();render();if(draft)message('stale',true);});
    const refresh=()=>{if(document.visibilityState==='hidden'){clearTimeout(timer);return;} if(!draft)read(); render();schedule();}; document.addEventListener('visibilitychange',refresh);window.addEventListener('pageshow',refresh);
    read();render();schedule();window.myntCountdowns={open,render:refresh};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
