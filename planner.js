/* ==========================================================================
   AI Study Planner - Smart Timetable Generator
   Rule-Based Scheduling Algorithm (Vanilla JavaScript)
   Prioritizes upcoming exam dates without claiming AI.
   Persists generated plans in localStorage via StudyData.
   ========================================================================== */

(function () {
  'use strict';

  var store = window.StudyData || window.SP;
  var PLAN_KEY = store ? store.K.plan : 'sp_plan';
  var SUBJ_KEY = store ? store.K.subjects : 'sp_subjects';

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, function (tag) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag);
    });
  }

  function timeToMinutes(t) {
    if (!t || typeof t !== 'string') return 0;
    var parts = t.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function minutesToTime(m) {
    var hrs = Math.floor(m / 60) % 24;
    var mins = m % 60;
    return String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  }

  function getDaysUntil(dateStr) {
    if (!dateStr) return 999;
    var target = new Date(dateStr + 'T00:00:00');
    var today = new Date((store ? store.dkey() : new Date().toISOString().slice(0, 10)) + 'T00:00:00');
    return Math.round((target - today) / 864e5);
  }

  function getStoredPlan() {
    var raw = store ? store.read(PLAN_KEY, []) : [];
    return Array.isArray(raw) ? raw : [];
  }

  function saveStoredPlan(plan) {
    if (store) store.write(PLAN_KEY, plan);
  }

  // Create subject entry row (Difficulty Select removed as requested)
  function addSubjectRow(initData) {
    initData = initData || {};
    var container = document.getElementById('pSubjects');
    if (!container) return;

    var row = document.createElement('div');
    row.className = 'p-row';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';
    row.innerHTML =
      '<input type="text" class="task-input pn" placeholder="Subject (e.g. Data Structures)" value="' + escapeHTML(initData.name || '') + '">' +
      '<input type="text" class="task-input pt" placeholder="Topics (e.g. Trees, Graphs, Sorting)" value="' + escapeHTML(initData.topics || '') + '">' +
      '<input type="date" class="priority-select pe" title="Upcoming Exam Date" value="' + (initData.exam || '') + '">' +
      '<button type="button" class="task-delete-btn" title="Remove Subject">✕</button>';

    var delBtn = row.querySelector('button');
    if (delBtn) delBtn.onclick = function () { row.remove(); };

    container.appendChild(row);
  }

  // Generate Rule-Based Timetable
  function generateTimetable() {
    var rows = document.querySelectorAll('.p-row');
    var subjects = [];
    rows.forEach(function (r) {
      var name = r.querySelector('.pn').value.trim();
      var rawTopics = r.querySelector('.pt').value;
      var topics = rawTopics.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      var exam = r.querySelector('.pe').value;
      
      if (name) {
        subjects.push({
          name: name,
          topics: topics,
          exam: exam
        });
      }
    });

    if (subjects.length === 0) {
      alert('Please add at least one subject with topics to generate your study timetable.');
      return;
    }

    var hoursPerDay = +document.getElementById('pHours').value || 4;
    var sessionLen = +document.getElementById('pSession').value || 45;
    var breakLen = +document.getElementById('pBreak').value || 10;
    var daysToPlan = +document.getElementById('pDays').value || 7;
    var startTimeStr = document.getElementById('pStart').value || '17:00';

    if (hoursPerDay <= 0 || hoursPerDay > 16) {
      alert('Available study hours must be between 1 and 16 per day.');
      return;
    }
    if (sessionLen < 15 || sessionLen > 180) {
      alert('Session duration must be between 15 and 180 minutes.');
      return;
    }
    if (breakLen < 0 || breakLen > 60) {
      alert('Break duration must be between 0 and 60 minutes.');
      return;
    }

    // Persist subjects settings
    if (store) store.write(SUBJ_KEY, subjects);

    // Calculate priority scores: based only on exam urgency now (Hard/Medium logic removed)
    subjects.forEach(function (s) {
      var examBonus = 0;
      if (s.exam) {
        var daysLeft = getDaysUntil(s.exam);
        if (daysLeft >= 0) {
          examBonus = Math.max(0, 14 - daysLeft); // Higher urgency if exam within 14 days
        }
      }
      // Base weight is now a constant 1 + exam urgency
      s.baseWeight = 1 + examBonus;
      s.sessionCount = 0;
    });

    var availableMins = hoursPerDay * 60;
    var slotLength = sessionLen + breakLen;
    var slotsPerDay = Math.floor((availableMins + breakLen) / slotLength);

    if (slotsPerDay < 1) {
      alert('Available study hours are too short for even a single session. Please increase hours or decrease session length.');
      return;
    }

    var startMinutes = timeToMinutes(startTimeStr);
    var generatedSchedule = [];
    var baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    for (var day = 0; day < daysToPlan; day++) {
      var currentDayDate = new Date(baseDate);
      currentDayDate.setDate(baseDate.getDate() + day);
      var dayKey = store ? store.dkey(currentDayDate) : currentDayDate.toISOString().slice(0, 10);
      var lastSubjectName = null;

      for (var slot = 0; slot < slotsPerDay; slot++) {
        // Filter subjects whose exam hasn't passed before this day
        var validSubs = subjects.filter(function (s) {
          return !s.exam || dayKey <= s.exam;
        });
        if (validSubs.length === 0) validSubs = subjects;

        // Balance selection: subject with highest weight / (sessionCount + 1), avoid repeating same subject immediately
        var ranked = validSubs.map(function (s) {
          var penalty = (s.name === lastSubjectName && validSubs.length > 1) ? 50 : 0;
          var score = (s.baseWeight * 10) / (s.sessionCount + 1) - penalty;
          return { subject: s, score: score };
        }).sort(function (a, b) { return b.score - a.score; });

        var pickedSubject = ranked[0].subject;
        var slotStart = startMinutes + slot * slotLength;
        var slotEnd = slotStart + sessionLen;

        // If extends past midnight, stop for the day
        if (slotEnd > 24 * 60) break;

        var topicIndex = pickedSubject.sessionCount % (pickedSubject.topics.length || 1);
        var topicName = pickedSubject.topics.length ? pickedSubject.topics[topicIndex] : 'Core Concept Revision';

        generatedSchedule.push({
          id: 'slot_' + Date.now() + '_' + generatedSchedule.length,
          date: dayKey,
          start: minutesToTime(slotStart),
          end: minutesToTime(slotEnd),
          duration: sessionLen,
          subject: pickedSubject.name,
          topic: topicName,
          status: 'planned', // 'planned' | 'done' | 'skipped'
          logged: false
        });

        pickedSubject.sessionCount++;
        lastSubjectName = pickedSubject.name;
      }
    }

    saveStoredPlan(generatedSchedule);
    renderTimetable();
  }

  function handleSessionAction(sessionId, action) {
    var plan = getStoredPlan();
    var session = plan.find(function (s) { return s.id === sessionId; });
    if (!session) return;

    if (action === 'delete') {
      if (confirm('Delete this scheduled study session?')) {
        plan = plan.filter(function (s) { return s.id !== sessionId; });
      }
    } else if (action === 'skip') {
      session.status = 'skipped';
    } else if (action === 'done') {
      session.status = 'done';
      if (!session.logged && store) {
        var duration = session.duration || (timeToMinutes(session.end) - timeToMinutes(session.start));
        store.recordSession(duration, session.subject, session.id);
        session.logged = true;
      }
    } else if (action === 'edit') {
      var newStart = prompt('Edit start time (HH:MM format, 24-hour):', session.start);
      if (newStart && /^\d{1,2}:\d{2}$/.test(newStart)) {
        var dur = session.duration || (timeToMinutes(session.end) - timeToMinutes(session.start));
        var newStartMin = timeToMinutes(newStart);
        var newEndMin = newStartMin + dur;
        if (newEndMin <= 1440) {
          session.start = minutesToTime(newStartMin);
          session.end = minutesToTime(newEndMin);
        }
      }
      var newTopic = prompt('Edit topic description:', session.topic);
      if (newTopic && newTopic.trim()) {
        session.topic = newTopic.trim();
      }
    }

    saveStoredPlan(plan);
    renderTimetable();
  }

  function renderTimetable() {
    var outputBox = document.getElementById('pOut');
    if (!outputBox) return;

    var plan = getStoredPlan();
    if (plan.length === 0) {
      outputBox.innerHTML =
        '<div style="text-align:center; padding: 24px; color: #888; background: #faf8f5; border-radius: 8px; border: 1px dashed #d5c8be;">' +
          '<i class="bx bx-calendar-x" style="font-size: 2rem; color: #8c4a27; margin-bottom: 8px; display: block;"></i>' +
          '<p>No timetable generated yet. Configure your subjects above and click <strong>"Generate Timetable"</strong>.</p>' +
        '</div>';
      return;
    }

    // Group by Date
    var grouped = {};
    plan.slice().sort(function (a, b) {
      return (a.date + a.start).localeCompare(b.date + b.start);
    }).forEach(function (s) {
      grouped[s.date] = grouped[s.date] || [];
      grouped[s.date].push(s);
    });

    var todayStr = store ? store.dkey() : new Date().toISOString().slice(0, 10);
    var html = '';

    Object.keys(grouped).forEach(function (dateKey) {
      var isToday = dateKey === todayStr;
      var dateObj = new Date(dateKey + 'T00:00:00');
      var dateLabel = isNaN(dateObj.getTime()) ? dateKey : dateObj.toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });

      html += '<div style="margin-top: 18px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">' +
        '<h4 style="color: #2b2b2b; display: flex; align-items: center; gap: 6px;">' +
          '<i class="bx bx-calendar"></i> ' + dateLabel +
          (isToday ? ' <span class="badge purple" style="font-size:0.72rem;">Today</span>' : '') +
        '</h4>' +
        '<span style="font-size: 0.8rem; color: #777;">' + grouped[dateKey].length + ' sessions</span>' +
      '</div>' +
      '<ul class="list-items" style="margin-bottom: 14px;">';

      grouped[dateKey].forEach(function (session) {
        var statusBadge = session.status === 'done'
          ? '<span class="badge green">Completed ✓</span>'
          : session.status === 'skipped'
          ? '<span class="badge orange">Skipped</span>'
          : '<span class="badge blue">Planned</span>';

        // Timing is displayed first, followed by subject and topic
        html += '<li style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 12px 14px;">' +
          '<div style="display: flex; align-items: center; gap: 12px; min-width: 220px;">' +
            '<span style="background: #faf8f5; border: 1px solid #e0dacf; border-radius: 6px; padding: 6px 10px; font-weight: 700; font-size: 0.85rem; color: #8c4a27;">' +
              session.start + ' – ' + session.end +
            '</span>' +
            '<div>' +
              '<strong style="font-size: 0.95rem; color: #222;">' + escapeHTML(session.subject) + '</strong>' +
              '<p style="color: #666; font-size: 0.82rem; margin-top: 2px;">' + escapeHTML(session.topic) + '</p>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; align-items: center; gap: 8px;">' +
            statusBadge +
            (session.status !== 'done' ? '<button type="button" class="sc-filter" data-action="done" data-id="' + session.id + '">Done</button>' : '') +
            (session.status === 'planned' ? '<button type="button" class="sc-filter" data-action="skip" data-id="' + session.id + '">Skip</button>' : '') +
            '<button type="button" class="sc-filter" data-action="edit" data-id="' + session.id + '">Edit</button>' +
            '<button type="button" class="task-delete-btn" data-action="delete" data-id="' + session.id + '" title="Delete session"><i class="bx bx-trash"></i></button>' +
          '</div>' +
        '</li>';
      });

      html += '</ul>';
    });

    outputBox.innerHTML = html;

    // Attach event listeners to action buttons
    outputBox.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.onclick = function () {
        handleSessionAction(btn.dataset.id, btn.dataset.action);
      };
    });
  }

  // Initialize
  function initPlanner() {
    var addBtn = document.getElementById('pAdd');
    var genBtn = document.getElementById('pGen');
    var clearBtn = document.getElementById('pClear');

    if (addBtn) addBtn.onclick = function () { addSubjectRow(); };
    if (genBtn) genBtn.onclick = generateTimetable;
    if (clearBtn) clearBtn.onclick = function () {
      if (confirm('Clear the entire generated timetable?')) {
        saveStoredPlan([]);
        renderTimetable();
      }
    };

    // Load saved subjects or defaults (Difficulty object removed)
    var savedSubjects = store ? store.read(SUBJ_KEY, []) : [];
    if (!savedSubjects || savedSubjects.length === 0) {
      savedSubjects = [
        { name: 'Data Structures & Algorithms', topics: 'Trees, Graphs, Dynamic Programming', exam: '' },
        { name: 'Database Management Systems', topics: 'Normalization, SQL Joins, Indexing', exam: '' },
        { name: 'Operating Systems', topics: 'CPU Scheduling, Deadlocks, Paging', exam: '' }
      ];
    }

    var subContainer = document.getElementById('pSubjects');
    if (subContainer && subContainer.children.length === 0) {
      savedSubjects.forEach(function (sub) {
        addSubjectRow(sub);
      });
    }

    renderTimetable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlanner);
  } else {
    initPlanner();
  }
})();
