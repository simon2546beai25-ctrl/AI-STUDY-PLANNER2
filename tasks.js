(function () {
  'use strict';

  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    console.warn('[TasksManager] React or ReactDOM not loaded.');
    return;
  }

  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var PRIORITY_WEIGHTS = { high: 3, medium: 2, low: 1 };

  function isTaskDone(task) {
    return Boolean(task.completed || task.status === 'Completed');
  }

  function getDaysUntil(dateStr, todayStr) {
    if (!dateStr) return 999;
    var target = new Date(dateStr + 'T00:00:00');
    var today = new Date(todayStr + 'T00:00:00');
    return Math.round((target - today) / 864e5);
  }

  function isOverdue(task, todayStr) {
    if (isTaskDone(task)) return false;
    if (!task.deadline) return false;
    return task.deadline < todayStr;
  }

  // Transparent recommendation score
  function computeTaskScore(task, todayStr) {
    var pWeight = (PRIORITY_WEIGHTS[task.priority] || 1) * 10;
    var deadlineBoost = 0;
    if (task.deadline) {
      var days = getDaysUntil(task.deadline, todayStr);
      if (days < 0) {
        deadlineBoost = 30; 
      } else if (days <= 3) {
        deadlineBoost = 20; 
      } else if (days <= 7) {
        deadlineBoost = 10;
      }
    }
    return pWeight + deadlineBoost;
  }

  function TaskManagerApp() {
    var store = window.StudyData || window.SP;
    var todayStr = store ? store.dkey() : new Date().toISOString().slice(0, 10);

    function loadInitialTasks() {
      if (!store) return [];
      var list = store.tasks();
      return list.map(function (t) {
        return {
          id: t.id || Date.now() + Math.random(),
          title: t.title || 'Untitled Task',
          subject: t.subject || 'General',
          deadline: t.deadline || '',
          priority: t.priority || 'medium',
          estimate: t.estimate || 30,
          completed: isTaskDone(t)
        };
      });
    }

    var [tasks, setTasks] = useState(loadInitialTasks);
    var [formTitle, setFormTitle] = useState('');
    var [formSubject, setFormSubject] = useState('');
    var [formDeadline, setFormDeadline] = useState('');
    var [formPriority, setFormPriority] = useState('medium');
    var [formEstimate, setFormEstimate] = useState(30);
    var [filterPriority, setFilterPriority] = useState('all');
    var [errorMsg, setErrorMsg] = useState('');

    function syncTasks(updatedList) {
      setTasks(updatedList);
      if (store) {
        store.saveTasks(updatedList);
      }
      var pendingEl = document.getElementById('pendingCount');
      if (pendingEl) {
        var count = updatedList.filter(function (t) { return !isTaskDone(t); }).length;
        pendingEl.innerText = count;
      }
    }

    useEffect(function () {
      var pendingEl = document.getElementById('pendingCount');
      if (pendingEl) {
        var count = tasks.filter(function (t) { return !isTaskDone(t); }).length;
        pendingEl.innerText = count;
      }
    }, [tasks]);

    function handleFormSubmit(e) {
      e.preventDefault();
      var cleanTitle = formTitle.trim();
      if (!cleanTitle) {
        setErrorMsg('Please enter a task title.');
        return;
      }
      var est = parseInt(formEstimate, 10);
      if (isNaN(est) || est <= 0) {
        setErrorMsg('Estimated time must be at least 1 minute.');
        return;
      }

      var newTask = {
        id: Date.now(),
        title: cleanTitle,
        subject: formSubject.trim() || 'General',
        deadline: formDeadline,
        priority: formPriority,
        estimate: est,
        completed: false
      };
      
      var newList = tasks.concat(newTask);
      syncTasks(newList);
      resetForm();
    }

    function resetForm() {
      setFormTitle('');
      setFormSubject('');
      setFormDeadline('');
      setFormPriority('medium');
      setFormEstimate(30);
      setErrorMsg('');
    }

    function deleteTask(id) {
      if (confirm('Are you sure you want to delete this task?')) {
        var filtered = tasks.filter(function (t) { return t.id !== id; });
        syncTasks(filtered);
      }
    }

    function toggleTaskStatus(task) {
      var nextDone = !isTaskDone(task);
      var updated = tasks.map(function (t) {
        if (t.id === task.id) {
          return Object.assign({}, t, {
            completed: nextDone
          });
        }
        return t;
      });
      syncTasks(updated);
      if (nextDone && store) {
        store.completeTask(task.id);
      }
    }

    // Calculations
    var totalTasks = tasks.length;
    var completedCount = tasks.filter(isTaskDone).length;
    var completionPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    var pendingTasks = tasks.filter(function (t) { return !isTaskDone(t); });
    var overdueCount = tasks.filter(function (t) { return isOverdue(t, todayStr); }).length;
    var upcomingCount = pendingTasks.filter(function (t) {
      if (!t.deadline || isOverdue(t, todayStr)) return false;
      var d = getDaysUntil(t.deadline, todayStr);
      return d >= 0 && d <= 3;
    }).length;

    // Highest recommended next task
    var recommendedTask = null;
    if (pendingTasks.length > 0) {
      var sortedPending = pendingTasks.slice().sort(function (a, b) {
        return computeTaskScore(b, todayStr) - computeTaskScore(a, todayStr);
      });
      recommendedTask = sortedPending[0];
    }

    // Filter list display
    var filteredList = tasks.filter(function (t) {
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      return true;
    });

    return h('div', null,
      // Overview Card
      h('div', { className: 'card', style: { marginBottom: '20px' } },
        h('div', { className: 'card-head' },
          h('h4', null,
            h('i', { className: 'bx bx-check-shield' }),
            ' Completion Overview: ' + completedCount + ' / ' + totalTasks + ' (' + completionPct + '%)'
          ),
          h('div', { style: { display: 'flex', gap: '8px', fontSize: '0.82rem' } },
            overdueCount > 0 ? h('span', { style: { color: '#e03131', fontWeight: 700 } },
              '⚠️ ' + overdueCount + ' Overdue'
            ) : null,
            upcomingCount > 0 ? h('span', { style: { color: '#d9480f', fontWeight: 600 } },
              '⏰ ' + upcomingCount + ' Due in 3 days'
            ) : null
          )
        ),
        h('div', { className: 'sc-track' },
          h('div', {
            className: 'sc-fill' + (completionPct >= 75 ? ' green' : ''),
            style: { width: completionPct + '%' }
          })
        ),

        // Transparent Recommendation
        recommendedTask ? h('div', {
          style: {
            background: '#faf8f5',
            border: '1px dashed #8c4a27',
            borderRadius: '8px',
            padding: '12px 16px',
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }
        },
          h('div', null,
            h('div', { style: { fontSize: '0.75rem', fontWeight: 700, color: '#8c4a27', textTransform: 'uppercase' } },
              '👉 Recommended Next Task'
            ),
            h('strong', { style: { fontSize: '0.95rem' } }, recommendedTask.title),
            h('span', { style: { color: '#666', fontSize: '0.82rem', marginLeft: '8px' } },
              '(' + recommendedTask.subject + (recommendedTask.deadline ? ' · Due ' + recommendedTask.deadline : '') + ' · ~' + recommendedTask.estimate + ' min)'
            )
          )
        ) : null
      ),

      // Task List & Controls Card
      h('div', { className: 'card' },
        h('div', { className: 'card-head' },
          h('h4', null,
            h('i', { className: 'bx bx-list-check' }),
            ' Tasks & Deadlines'
          ),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            // Priority Filter
            h('select', {
              className: 'priority-select',
              value: filterPriority,
              onChange: function (e) { setFilterPriority(e.target.value); }
            },
              h('option', { value: 'all' }, 'All Priorities'),
              h('option', { value: 'high' }, 'High Priority'),
              h('option', { value: 'medium' }, 'Medium Priority'),
              h('option', { value: 'low' }, 'Low Priority')
            )
          )
        ),

        // Task Items List
        h('ul', { className: 'todo-list', style: { minHeight: '60px' } },
          filteredList.length === 0
            ? h('li', { style: { color: '#888', fontStyle: 'italic', padding: '16px' } },
                'No tasks found.'
              )
            : filteredList.map(function (task) {
                var done = isTaskDone(task);
                var overdue = isOverdue(task, todayStr);
                var daysLeft = task.deadline ? getDaysUntil(task.deadline, todayStr) : null;

                return h('li', {
                  key: task.id,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom: '1px solid #f0ede8',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }
                },
                  h('label', {
                    style: {
                      display: 'flex',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      flex: 1,
                      minWidth: '220px'
                    }
                  },
                    h('input', {
                      type: 'checkbox',
                      checked: done,
                      style: { marginTop: '4px', cursor: 'pointer' },
                      onChange: function () { toggleTaskStatus(task); }
                    }),
                    h('div', { style: { marginLeft: '12px' } },
                      h('span', {
                        className: done ? 'completed-task' : '',
                        style: { fontWeight: 600, fontSize: '0.92rem' }
                      }, task.title),
                      h('div', { style: { fontSize: '0.78rem', color: '#777', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' } },
                        h('span', null, '📚 ' + task.subject),
                        task.deadline ? h('span', { style: { color: overdue ? '#e03131' : '#666', fontWeight: overdue ? 700 : 500 } },
                          '📅 ' + task.deadline + (daysLeft !== null ? (daysLeft < 0 ? ' (' + Math.abs(daysLeft) + 'd overdue)' : daysLeft === 0 ? ' (Today!)' : ' (' + daysLeft + 'd left)') : '')
                        ) : null,
                        h('span', null, '⏱️ ~' + task.estimate + ' min')
                      )
                    )
                  ),

                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    overdue ? h('span', { className: 'tag high', style: { background: '#ffe3e3', color: '#c92a2a' } }, 'OVERDUE') : null,
                    h('span', { className: 'tag ' + task.priority }, task.priority.toUpperCase()),
                    // REMOVED "Completed" Badge from here
                    h('button', {
                      type: 'button',
                      className: 'task-delete-btn',
                      title: 'Delete Task',
                      onClick: function () { deleteTask(task.id); }
                    }, h('i', { className: 'bx bx-trash' }))
                  )
                );
              })
        ),

        // Add Task Form
        h('form', {
          id: 'taskFormElement',
          className: 'add-task-bar',
          style: { flexWrap: 'wrap', marginTop: '20px' },
          onSubmit: handleFormSubmit
        },
          h('div', { style: { width: '100%', marginBottom: '4px', fontWeight: 600, fontSize: '0.85rem', color: '#8c4a27' } },
            '➕ Add New Academic Task'
          ),
          h('input', {
            type: 'text',
            className: 'task-input',
            style: { flex: 2, minWidth: '180px' },
            placeholder: 'Task title (e.g. Chapter 4 Practice Problems)',
            value: formTitle,
            onChange: function (e) { setFormTitle(e.target.value); }
          }),
          h('input', {
            type: 'text',
            className: 'task-input',
            style: { flex: 1, minWidth: '130px' },
            placeholder: 'Subject (e.g. OS, DBMS)',
            value: formSubject,
            onChange: function (e) { setFormSubject(e.target.value); }
          }),
          h('input', {
            type: 'date',
            className: 'priority-select',
            title: 'Deadline date',
            value: formDeadline,
            onChange: function (e) { setFormDeadline(e.target.value); }
          }),
          h('input', {
            type: 'number',
            min: 5,
            max: 600,
            className: 'priority-select',
            style: { width: '100px' },
            title: 'Estimated study minutes',
            placeholder: 'Est. min',
            value: formEstimate,
            onChange: function (e) { setFormEstimate(e.target.value); }
          }),
          h('select', {
            className: 'priority-select',
            value: formPriority,
            onChange: function (e) { setFormPriority(e.target.value); }
          },
            h('option', { value: 'high' }, 'High Priority'),
            h('option', { value: 'medium' }, 'Medium Priority'),
            h('option', { value: 'low' }, 'Low Priority')
          ),
          h('button', {
            type: 'submit',
            className: 'btn-submit-task'
          }, '+ Add Task'),
          errorMsg ? h('p', {
            style: { color: '#e03131', fontSize: '0.85rem', marginTop: '8px' }
          }, errorMsg) : null
        )
      )
    );
  }

  function mountTaskManager() {
    var container = document.getElementById('taskManagerRoot');
    if (container) {
      var root = ReactDOM.createRoot(container);
      root.render(h(TaskManagerApp));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountTaskManager);
  } else {
    mountTaskManager();
  }
})();
