/* OpenTodo — a self-contained to-do app.
   Data lives in localStorage. No server, no build step. */
(function () {
  'use strict';

  const STORE_KEY = 'opentodo.tasks.v1';
  const THEME_KEY = 'opentodo.theme';
  const SEEN_KEY = 'opentodo.remindersSeen.v1'; // reminders already surfaced as desktop notifs

  const PRIORITIES = ['low', 'medium', 'high', 'critical'];
  const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUSES = ['todo', 'in-progress', 'done'];
  const DAY = 86400000;

  /* ---------- State ---------- */
  let tasks = load();
  let currentView = 'dashboard';
  let editingSubtasks = []; // working copy while modal is open
  let notifiedIds = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));

  /* ---------- Persistence ---------- */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(tasks));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Date helpers ---------- */
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function parseDate(s) { return s ? new Date(s + 'T00:00:00') : null; }
  function fmtDate(s) {
    if (!s) return '';
    const d = parseDate(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }
  function daysUntil(s) {
    if (!s) return null;
    const due = parseDate(s).getTime();
    const start = parseDate(todayStr()).getTime();
    return Math.round((due - start) / DAY);
  }
  function relativeWhen(s) {
    const d = daysUntil(s);
    if (d === null) return '';
    if (d < 0) return `${Math.abs(d)}d overdue`;
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    return `Due in ${d}d`;
  }

  /* ---------- Progress ---------- */
  function computeProgress(t) {
    if (t.status === 'done') return 100;
    if (t.subtasks && t.subtasks.length) {
      const done = t.subtasks.filter(s => s.done).length;
      return Math.round((done / t.subtasks.length) * 100);
    }
    return t.progress || 0;
  }

  /* ---------- Recurrence ---------- */
  function nextDate(dateStr, recur) {
    const d = parseDate(dateStr);
    switch (recur) {
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
      case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
      default: return null;
    }
    return d.toISOString().slice(0, 10);
  }
  // When a recurring task is completed, spawn the next occurrence.
  function spawnRecurrence(t) {
    if (!t.recur || t.recur === 'none') return;
    const anchor = t.due || t.start || todayStr();
    const nextDue = nextDate(anchor, t.recur);
    if (!nextDue) return;
    let nextStart = null;
    if (t.start && t.due) {
      const span = daysBetween(t.start, t.due);
      nextStart = shiftDate(nextDue, -span);
    } else if (t.start && !t.due) {
      nextStart = nextDate(t.start, t.recur);
    }
    tasks.push({
      id: uid(),
      title: t.title,
      notes: t.notes,
      priority: t.priority,
      status: 'todo',
      start: nextStart,
      due: nextDue,
      recur: t.recur,
      reminder: t.reminder,
      progress: 0,
      subtasks: (t.subtasks || []).map(s => ({ id: uid(), text: s.text, done: false })),
      createdAt: new Date().toISOString(),
      completedAt: null
    });
  }
  function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / DAY);
  }
  function shiftDate(s, days) {
    const d = parseDate(s); d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /* ---------- Reminders ---------- */
  // A task is "reminding" if reminder on, not done, has a due date that is tomorrow or sooner.
  function dueReminders() {
    return tasks
      .filter(t => t.reminder && t.status !== 'done' && t.due)
      .map(t => ({ t, d: daysUntil(t.due) }))
      .filter(x => x.d !== null && x.d <= 1)
      .sort((a, b) => a.d - b.d)
      .map(x => x.t);
  }

  function refreshReminders() {
    const rem = dueReminders();
    const countEl = $('#reminderCount');
    countEl.textContent = rem.length;
    countEl.hidden = rem.length === 0;

    const list = $('#reminderList');
    list.innerHTML = '';
    if (!rem.length) {
      list.innerHTML = '<li class="r-empty">You\'re all caught up 🎉</li>';
    } else {
      rem.forEach(t => {
        const li = document.createElement('li');
        const when = daysUntil(t.due);
        li.innerHTML = `<span class="r-title">${esc(t.title)}</span>
          <span class="r-meta">${when < 0 ? 'Overdue' : when === 0 ? 'Due today' : 'Due tomorrow'} · ${fmtDate(t.due)} · ${cap(t.priority)} priority</span>`;
        li.onclick = () => { closeReminderPanel(); openModal(t.id); };
        list.appendChild(li);
      });
    }

    // Fire desktop notifications for day-before reminders we haven't announced yet.
    if ('Notification' in window && Notification.permission === 'granted') {
      rem.filter(t => daysUntil(t.due) === 1 && !notifiedIds.has(t.id)).forEach(t => {
        new Notification('Task due tomorrow: ' + t.title, {
          body: `${fmtDate(t.due)} · ${cap(t.priority)} priority`,
          tag: t.id
        });
        notifiedIds.add(t.id);
      });
      localStorage.setItem(SEEN_KEY, JSON.stringify([...notifiedIds]));
    }
  }

  /* ---------- Rendering ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

  function activeTasks() { return tasks.filter(t => t.status !== 'done'); }

  function render() {
    refreshReminders();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'list') renderList();
    if (currentView === 'board') renderBoard();
    if (currentView === 'completed') renderCompleted();
  }

  function renderDashboard() {
    const active = activeTasks();
    const done = tasks.filter(t => t.status === 'done');
    const avg = active.length ? Math.round(active.reduce((s, t) => s + computeProgress(t), 0) / active.length) : 0;
    const dueSoon = active.filter(t => t.due && daysUntil(t.due) !== null && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 1).length;
    const overdue = active.filter(t => t.due && daysUntil(t.due) < 0).length;

    $('#statTotal').textContent = active.length;
    $('#statProgress').textContent = avg + '%';
    $('#statDueSoon').textContent = dueSoon;
    $('#statOverdue').textContent = overdue;
    $('#statDone').textContent = done.length;

    // Priority breakdown
    const pb = $('#priorityBreakdown');
    pb.innerHTML = '';
    const max = Math.max(1, ...PRIORITIES.map(p => active.filter(t => t.priority === p).length));
    [...PRIORITIES].reverse().forEach(p => {
      const n = active.filter(t => t.priority === p).length;
      const row = document.createElement('div');
      row.className = 'pb-row';
      row.innerHTML = `<span class="pb-label">${cap(p)}</span>
        <span class="pb-bar"><span class="pb-fill" style="width:${(n / max) * 100}%;background:var(--prio-${p})"></span></span>
        <span class="pb-count">${n}</span>`;
      pb.appendChild(row);
    });

    // Coming up (next 5 dated, active)
    const up = $('#upcomingList');
    up.innerHTML = '';
    const upcoming = active.filter(t => t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
    if (!upcoming.length) {
      up.innerHTML = '<li style="cursor:default;color:var(--text-dim)">Nothing scheduled.</li>';
    } else {
      upcoming.forEach(t => {
        const li = document.createElement('li');
        const overdueCls = daysUntil(t.due) < 0;
        li.innerHTML = `<span class="chip prio-${t.priority}">${cap(t.priority)}</span>
          <span>${esc(t.title)}</span>
          <span class="up-when" style="${overdueCls ? 'color:var(--danger)' : ''}">${relativeWhen(t.due)}</span>`;
        li.onclick = () => openModal(t.id);
        up.appendChild(li);
      });
    }
  }

  function taskCardHTML(t) {
    const pct = computeProgress(t);
    const chips = [];
    chips.push(`<span class="chip prio-${t.priority}">${cap(t.priority)}</span>`);
    if (t.recur && t.recur !== 'none') chips.push(`<span class="chip recur">↻ ${cap(t.recur)}</span>`);
    if (t.start && t.due && t.start !== t.due) {
      chips.push(`<span class="chip">${fmtDate(t.start)} → ${fmtDate(t.due)}</span>`);
    } else if (t.due) {
      const d = daysUntil(t.due);
      const cls = d < 0 ? 'overdue' : (d <= 1 ? 'due-soon' : '');
      chips.push(`<span class="chip ${cls}">${relativeWhen(t.due)} · ${fmtDate(t.due)}</span>`);
    }
    if (t.subtasks && t.subtasks.length) {
      const dn = t.subtasks.filter(s => s.done).length;
      chips.push(`<span class="chip">☑ ${dn}/${t.subtasks.length}</span>`);
    }
    return `
      <button class="task-check ${t.status === 'done' ? 'checked' : ''}" data-check="${t.id}" title="Toggle complete">${t.status === 'done' ? '✓' : ''}</button>
      <div class="task-main" data-open="${t.id}">
        <p class="task-title">${esc(t.title)}</p>
        <div class="task-meta">${chips.join('')}</div>
        <div class="task-progress">
          <span class="progress-track"><span class="progress-bar" style="width:${pct}%"></span></span>
          <span class="progress-pct">${pct}%</span>
        </div>
      </div>`;
  }

  function renderList() {
    const q = $('#searchInput').value.trim().toLowerCase();
    const fp = $('#filterPriority').value;
    const sort = $('#sortBy').value;

    let rows = activeTasks();
    if (q) rows = rows.filter(t => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(q));
    if (fp) rows = rows.filter(t => t.priority === fp);

    rows.sort((a, b) => {
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (sort === 'created') return (b.createdAt || '').localeCompare(a.createdAt || '');
      if (sort === 'progress') return computeProgress(b) - computeProgress(a);
      // due (default): dated first, ascending; undated last
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    });

    const list = $('#taskList');
    list.innerHTML = '';
    $('#listEmpty').hidden = rows.length !== 0;
    rows.forEach(t => {
      const card = document.createElement('div');
      card.className = `task-card prio-${t.priority} ${t.status === 'done' ? 'is-done' : ''}`;
      card.innerHTML = taskCardHTML(t);
      list.appendChild(card);
    });
  }

  function renderBoard() {
    STATUSES.forEach(st => {
      const body = $(`.board-col-body[data-status="${st}"]`);
      body.innerHTML = '';
      const rows = tasks.filter(t => t.status === st)
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      $(`.col-count[data-count="${st}"]`).textContent = rows.length;
      rows.forEach(t => {
        const pct = computeProgress(t);
        const card = document.createElement('div');
        card.className = `board-card prio-${t.priority}`;
        card.draggable = true;
        card.dataset.id = t.id;
        const dueChip = t.due ? `<span class="chip ${daysUntil(t.due) < 0 ? 'overdue' : (daysUntil(t.due) <= 1 ? 'due-soon' : '')}">${relativeWhen(t.due)}</span>` : '';
        card.innerHTML = `
          <p class="task-title" data-open="${t.id}">${esc(t.title)}</p>
          <div class="task-meta">
            <span class="chip prio-${t.priority}">${cap(t.priority)}</span>
            ${t.recur && t.recur !== 'none' ? '<span class="chip recur">↻</span>' : ''}
            ${dueChip}
          </div>
          <div class="task-progress">
            <span class="progress-track"><span class="progress-bar" style="width:${pct}%"></span></span>
            <span class="progress-pct">${pct}%</span>
          </div>`;
        body.appendChild(card);
      });
    });
    wireDragDrop();
  }

  function renderCompleted() {
    const done = tasks.filter(t => t.status === 'done' && t.completedAt)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const list = $('#completedList');
    list.innerHTML = '';
    $('#completedEmpty').hidden = done.length !== 0;
    done.forEach(t => {
      const when = new Date(t.completedAt);
      const row = document.createElement('div');
      row.className = 'completed-row';
      row.innerHTML = `<span class="c-check">✓</span>
        <span class="c-title" data-open="${t.id}">${esc(t.title)}</span>
        <span class="chip prio-${t.priority}">${cap(t.priority)}</span>
        <span class="c-when">${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>`;
      list.appendChild(row);
    });
  }

  /* ---------- Drag & drop (Kanban) ---------- */
  function wireDragDrop() {
    let dragId = null;
    $$('.board-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragId = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    $$('.board-col-body').forEach(body => {
      body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', e => {
        e.preventDefault();
        body.classList.remove('drag-over');
        if (!dragId) return;
        setStatus(dragId, body.dataset.status);
        dragId = null;
      });
    });
  }

  function setStatus(id, status) {
    const t = tasks.find(x => x.id === id);
    if (!t || t.status === status) return;
    applyStatusChange(t, status);
    save();
    render();
  }

  // Centralizes side effects of a status transition (completion time, recurrence).
  function applyStatusChange(t, status) {
    const wasDone = t.status === 'done';
    t.status = status;
    if (status === 'done' && !wasDone) {
      t.completedAt = new Date().toISOString();
      t.progress = 100;
      spawnRecurrence(t);
    } else if (status !== 'done' && wasDone) {
      t.completedAt = null;
    }
  }

  /* ---------- Task check toggle ---------- */
  function toggleComplete(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    applyStatusChange(t, t.status === 'done' ? 'todo' : 'done');
    save();
    render();
    if (t.status === 'done') toast('Task completed ✓');
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    const isEdit = !!id;
    const t = isEdit ? tasks.find(x => x.id === id) : null;
    $('#modalTitle').textContent = isEdit ? 'Edit task' : 'New task';
    $('#f-id').value = id || '';
    $('#f-title').value = t ? t.title : '';
    $('#f-notes').value = t ? (t.notes || '') : '';
    $('#f-priority').value = t ? t.priority : 'medium';
    $('#f-status').value = t ? t.status : 'todo';
    $('#f-start').value = t ? (t.start || '') : '';
    $('#f-due').value = t ? (t.due || '') : '';
    $('#f-recur').value = t ? (t.recur || 'none') : 'none';
    $('#f-reminder').checked = t ? !!t.reminder : true;
    $('#f-progress').value = t ? (t.progress || 0) : 0;
    editingSubtasks = t ? (t.subtasks || []).map(s => ({ ...s })) : [];
    renderSubtaskEditor();
    updateProgressUI();
    $('#deleteBtn').hidden = !isEdit;
    $('#modalOverlay').hidden = false;
    setTimeout(() => $('#f-title').focus(), 30);
  }
  function closeModal() { $('#modalOverlay').hidden = true; }

  function renderSubtaskEditor() {
    const wrap = $('#subtaskList');
    wrap.innerHTML = '';
    editingSubtasks.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'subtask-item ' + (s.done ? 'st-done' : '');
      row.innerHTML = `<input type="checkbox" ${s.done ? 'checked' : ''} data-st-toggle="${i}">
        <span class="st-text">${esc(s.text)}</span>
        <button type="button" class="st-del" data-st-del="${i}" aria-label="Remove">✕</button>`;
      wrap.appendChild(row);
    });
    updateProgressUI();
  }

  function updateProgressUI() {
    const hasSub = editingSubtasks.length > 0;
    const range = $('#f-progress');
    const hint = $('#progressHint');
    if (hasSub) {
      const done = editingSubtasks.filter(s => s.done).length;
      const pct = Math.round((done / editingSubtasks.length) * 100);
      range.value = pct;
      range.disabled = true;
      hint.textContent = `Auto: ${done}/${editingSubtasks.length} subtasks done. Remove subtasks to set progress manually.`;
    } else {
      range.disabled = false;
      hint.textContent = 'No subtasks — drag to set progress manually.';
    }
    $('#progressOut').textContent = range.value + '%';
  }

  function saveFromForm(e) {
    e.preventDefault();
    const id = $('#f-id').value;
    const title = $('#f-title').value.trim();
    if (!title) return;
    const start = $('#f-start').value || null;
    const due = $('#f-due').value || null;
    if (start && due && due < start) { toast('Due date is before start date'); return; }

    const data = {
      title,
      notes: $('#f-notes').value.trim(),
      priority: $('#f-priority').value,
      start, due,
      recur: $('#f-recur').value,
      reminder: $('#f-reminder').checked,
      progress: parseInt($('#f-progress').value, 10) || 0,
      subtasks: editingSubtasks.map(s => ({ id: s.id || uid(), text: s.text, done: !!s.done }))
    };

    if (id) {
      const t = tasks.find(x => x.id === id);
      Object.assign(t, data);
      applyStatusChange(t, $('#f-status').value);
    } else {
      const status = $('#f-status').value;
      const t = {
        id: uid(), ...data, status: 'todo',
        createdAt: new Date().toISOString(), completedAt: null
      };
      tasks.push(t);
      applyStatusChange(t, status);
    }
    save();
    closeModal();
    render();
    toast(id ? 'Task updated' : 'Task added');
  }

  function deleteTask() {
    const id = $('#f-id').value;
    if (!id) return;
    if (!confirm('Delete this task permanently?')) return;
    tasks = tasks.filter(t => t.id !== id);
    save();
    closeModal();
    render();
    toast('Task deleted');
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.hidden = true, 2200);
  }

  /* ---------- Views ---------- */
  function switchView(v) {
    currentView = v;
    $$('.view-tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
    $$('.view').forEach(sec => sec.hidden = sec.id !== 'view-' + v);
    render();
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('#themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem(THEME_KEY, theme);
  }

  /* ---------- Reminder panel ---------- */
  function openReminderPanel() { $('#reminderPanel').hidden = false; refreshReminders(); }
  function closeReminderPanel() { $('#reminderPanel').hidden = true; }

  /* ---------- Seed sample data on first run ---------- */
  function seedIfEmpty() {
    if (tasks.length) return;
    const t = todayStr();
    tasks = [
      { id: uid(), title: 'Welcome to OpenTodo 👋', notes: 'Click a task to edit it. Try the Board tab to drag between columns.', priority: 'medium', status: 'todo', start: null, due: t, recur: 'none', reminder: true, progress: 0, subtasks: [{ id: uid(), text: 'Add your first real task', done: false }, { id: uid(), text: 'Explore the Dashboard', done: true }], createdAt: new Date().toISOString(), completedAt: null },
      { id: uid(), title: 'Submit quarterly report', notes: '', priority: 'high', status: 'in-progress', start: shiftDate(t, -1), due: shiftDate(t, 1), recur: 'none', reminder: true, progress: 40, subtasks: [], createdAt: new Date().toISOString(), completedAt: null },
      { id: uid(), title: 'Weekly team standup', notes: '', priority: 'low', status: 'todo', start: null, due: shiftDate(t, 2), recur: 'weekly', reminder: true, progress: 0, subtasks: [], createdAt: new Date().toISOString(), completedAt: null }
    ];
    save();
  }

  /* ---------- Wire up events ---------- */
  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    seedIfEmpty();

    $$('.view-tab').forEach(b => b.onclick = () => switchView(b.dataset.view));
    $('#newTaskBtn').onclick = () => openModal(null);
    $('#themeToggle').onclick = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

    // Reminder bell
    $('#reminderBell').onclick = (e) => {
      e.stopPropagation();
      $('#reminderPanel').hidden ? openReminderPanel() : closeReminderPanel();
    };
    document.addEventListener('click', e => {
      if (!$('#reminderPanel').hidden && !$('#reminderPanel').contains(e.target) && e.target !== $('#reminderBell')) closeReminderPanel();
    });
    $('#enableNotifBtn').onclick = () => {
      if (!('Notification' in window)) { toast('Notifications not supported'); return; }
      Notification.requestPermission().then(p => {
        toast(p === 'granted' ? 'Desktop alerts on' : 'Permission denied');
        refreshReminders();
      });
    };

    // Modal
    $('#modalClose').onclick = closeModal;
    $('#cancelBtn').onclick = closeModal;
    $('#taskForm').onsubmit = saveFromForm;
    $('#deleteBtn').onclick = deleteTask;
    $('#modalOverlay').addEventListener('click', e => { if (e.target === $('#modalOverlay')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeReminderPanel(); } });

    // Progress slider live label
    $('#f-progress').addEventListener('input', () => $('#progressOut').textContent = $('#f-progress').value + '%');

    // Subtask add
    $('#subtaskInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (!v) return;
        editingSubtasks.push({ id: uid(), text: v, done: false });
        e.target.value = '';
        renderSubtaskEditor();
      }
    });
    // Subtask toggle / delete (delegated)
    $('#subtaskList').addEventListener('click', e => {
      const del = e.target.closest('[data-st-del]');
      if (del) { editingSubtasks.splice(+del.dataset.stDel, 1); renderSubtaskEditor(); return; }
    });
    $('#subtaskList').addEventListener('change', e => {
      const tog = e.target.closest('[data-st-toggle]');
      if (tog) { editingSubtasks[+tog.dataset.stToggle].done = tog.checked; renderSubtaskEditor(); }
    });

    // List toolbar
    ['#searchInput', '#filterPriority', '#sortBy'].forEach(s => $(s).addEventListener('input', renderList));

    // Delegated clicks for task cards (open + check) across views
    document.addEventListener('click', e => {
      const check = e.target.closest('[data-check]');
      if (check) { e.stopPropagation(); toggleComplete(check.dataset.check); return; }
      const open = e.target.closest('[data-open]');
      if (open) { openModal(open.dataset.open); return; }
    });

    switchView('dashboard');

    // Re-check reminders periodically (handles the app being left open past midnight).
    setInterval(refreshReminders, 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
