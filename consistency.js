/* ==========================================================================
   AI Study Planner - Study Consistency Widget
   Implemented with React (React.createElement, hooks) WITHOUT JSX / TSX
   Mounts into #studyConsistencyRoot on Dashboard & Homepage
   Uses window.StudyData (or window.SP) for persistent localStorage data
   ========================================================================== */

(function () {
  'use strict';

  // Guard: React & ReactDOM must be available on window
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    console.warn('[ConsistencyWidget] React or ReactDOM not loaded.');
    return;
  }

  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  function formatMinutes(min) {
    min = Math.round(min || 0);
    var hrs = Math.floor(min / 60);
    var rem = min % 60;
    if (hrs > 0 && rem > 0) return hrs + 'h ' + rem + 'm';
    if (hrs > 0) return hrs + 'h';
    return rem + 'm';
  }

  // Subcomponent: Weekly Bar Chart
  function WeeklyBarChart(props) {
    var maxVal = Math.max(props.goal, 1);
    props.days.forEach(function (d) {
      if (d.minutes > maxVal) maxVal = d.minutes;
    });

    var goalPercent = Math.min(100, Math.round((props.goal / maxVal) * 100));

    return h('div', null,
      h('div', { className: 'sc-bars', title: 'Daily study minutes vs goal' },
        props.days.map(function (d) {
          var barPercent = Math.min(100, Math.round((d.minutes / maxVal) * 100));
          var isGoalHit = d.minutes >= props.goal && props.goal > 0;
          var barClass = 'sc-bar' + (isGoalHit ? ' hit' : d.minutes > 0 ? ' active' : '');

          return h('div', {
            key: d.date,
            className: 'sc-bar-col',
            title: d.date + ' (' + d.label + '): ' + formatMinutes(d.minutes) + (isGoalHit ? ' (Goal Met!)' : '')
          },
            h('div', { className: 'sc-bar-track' },
              h('div', {
                className: barClass,
                style: { height: Math.max(barPercent, 4) + '%' }
              }),
              h('div', {
                className: 'sc-goal-line',
                style: { bottom: goalPercent + '%' },
                title: 'Goal: ' + formatMinutes(props.goal)
              })
            ),
            h('small', null, d.label)
          );
        })
      ),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#777', padding: '0 4px' } },
        h('span', null, '── Goal Target: ' + formatMinutes(props.goal)),
        h('span', null, '🟢 Green = Goal Met')
      )
    );
  }

  // Subcomponent: Calendar-Style Monthly Heatmap
  function MonthlyHeatmap(props) {
    return h('div', null,
      h('div', { className: 'sc-heat' },
        props.days.map(function (d) {
          var level = 0;
          if (d.minutes > 0) {
            if (d.minutes >= props.goal) level = 3;
            else if (d.minutes >= props.goal / 2) level = 2;
            else level = 1;
          }

          return h('div', {
            key: d.date,
            className: 'sc-cell l' + level,
            title: d.date + ': ' + formatMinutes(d.minutes) + ' studied'
          }, d.day);
        })
      ),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#777' } },
        h('span', null, 'Less'),
        h('div', { className: 'sc-cell l0', style: { width: 14, height: 14 } }),
        h('div', { className: 'sc-cell l1', style: { width: 14, height: 14 } }),
        h('div', { className: 'sc-cell l2', style: { width: 14, height: 14 } }),
        h('div', { className: 'sc-cell l3', style: { width: 14, height: 14 } }),
        h('span', null, 'More (Goal Met)')
      )
    );
  }

  // Main React Component for Consistency Tracker
  function StudyConsistencyApp() {
    var store = window.StudyData || window.SP;
    var [viewRange, setViewRange] = useState('week'); // 'week' | 'month'
    var [refreshKey, setRefreshKey] = useState(0);
    var [logMinutes, setLogMinutes] = useState('');
    var [logSubject, setLogSubject] = useState('');
    var [feedbackMsg, setFeedbackMsg] = useState('');

    var numDays = viewRange === 'week' ? 7 : 30;
    var goalMin = store ? store.getGoal() : 120;
    var daysData = store ? store.lastDays(numDays) : [];
    var totalMin = daysData.reduce(function (sum, d) { return sum + d.minutes; }, 0);
    var daysHitGoal = daysData.filter(function (d) { return d.minutes >= goalMin; }).length;

    var expectedTotal = goalMin * numDays;
    var completionPct = expectedTotal > 0 ? Math.min(100, Math.round((totalMin / expectedTotal) * 100)) : 0;

    var streaks = store ? store.streaks() : { current: 0, longest: 0 };
    var todaySession = daysData.length ? daysData[daysData.length - 1].minutes : 0;
    var isDemoData = store ? store.isDemo() : false;
    var hasAnyData = store ? store.hasAny() : false;

    // Friendly motivational progress message based on actual statistics
    var motivationMsg = '';
    if (!hasAnyData) {
      motivationMsg = 'No study sessions logged yet. Record your first session below to jumpstart your streak!';
    } else if (completionPct >= 80) {
      motivationMsg = 'Outstanding consistency! You are on track to achieve top grades this semester! 🚀';
    } else if (completionPct >= 50) {
      motivationMsg = 'Great work! You are building reliable academic momentum day by day. 🌟';
    } else if (completionPct >= 25) {
      motivationMsg = 'Solid start. Adding one extra 25-minute Pomodoro session will push your streak higher! 💪';
    } else {
      motivationMsg = 'Every minute counts towards your target CGPA. Try a 20-minute review session today!';
    }

    function handleLogSession(e) {
      if (e) e.preventDefault();
      var m = parseInt(logMinutes, 10);
      if (isNaN(m) || m <= 0 || m > 600) {
        setFeedbackMsg('Please enter valid minutes between 1 and 600.');
        return;
      }

      if (store) {
        store.recordSession(m, logSubject.trim() || 'General Study');
        setFeedbackMsg('Recorded ' + m + ' minutes! Keep up the great work! ✨');
        setLogMinutes('');
        setLogSubject('');
        setRefreshKey(function (prev) { return prev + 1; });
        setTimeout(function () { setFeedbackMsg(''); }, 4000);
      }
    }

    function handleChangeGoal() {
      var current = goalMin;
      var input = prompt('Enter your daily study goal in minutes (e.g. 60, 120, 180):', current);
      if (input !== null) {
        var parsed = parseInt(input, 10);
        if (!isNaN(parsed) && parsed >= 15 && parsed <= 960) {
          if (store) store.setGoal(parsed);
          setRefreshKey(function (prev) { return prev + 1; });
        } else {
          alert('Please enter a goal between 15 and 960 minutes.');
        }
      }
    }

    function handleLoadDemo() {
      if (store) {
        store.loadDemo();
        setRefreshKey(function (prev) { return prev + 1; });
      }
    }

    function handleResetDemo() {
      if (confirm('Clear demo data and start fresh?')) {
        if (store) {
          var real = store.sessions().filter(function (s) { return !s.demo; });
          store.write(store.K.sessions, real);
          setRefreshKey(function (prev) { return prev + 1; });
        }
      }
    }

    return h('div', { className: 'card', style: { marginTop: '20px' } },
      // Card Header with Range Filters
      h('div', { className: 'card-head' },
        h('h4', null,
          h('i', { className: 'bx bx-bar-chart-alt-2' }),
          ' Study Consistency & Habits'
        ),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button', {
            type: 'button',
            className: 'sc-filter' + (viewRange === 'week' ? ' on' : ''),
            onClick: function () { setViewRange('week'); }
          }, 'Weekly'),
          h('button', {
            type: 'button',
            className: 'sc-filter' + (viewRange === 'month' ? ' on' : ''),
            onClick: function () { setViewRange('month'); }
          }, 'Monthly (30 Days)')
        )
      ),

      // Demo or Empty State Banner
      isDemoData ? h('div', { className: 'sc-demo' },
        h('span', null,
          h('strong', null, 'Demo Data Active: '),
          'Sample sessions are loaded for illustration. Log a session below to add real data.'
        ),
        h('button', {
          type: 'button',
          className: 'sc-filter',
          style: { padding: '4px 8px', fontSize: '0.75rem' },
          onClick: handleResetDemo
        }, 'Clear Demo')
      ) : (!hasAnyData ? h('div', { className: 'sc-demo' },
        h('span', null, 'No study history recorded yet. You can log real sessions or load demo data.'),
        h('button', {
          type: 'button',
          className: 'sc-filter',
          style: { padding: '4px 8px', fontSize: '0.75rem' },
          onClick: handleLoadDemo
        }, 'Load Demo Data')
      ) : null),

      // Key Metrics Row
      h('div', { className: 'sc-stats' },
        h('div', null,
          h('span', null, "Today's Study"),
          h('strong', null, formatMinutes(todaySession) + ' / ' + formatMinutes(goalMin))
        ),
        h('div', null,
          h('span', null, viewRange === 'week' ? 'Weekly Hours' : '30-Day Hours'),
          h('strong', null, (totalMin / 60).toFixed(1) + ' hrs')
        ),
        h('div', null,
          h('span', null, 'Goal Completion'),
          h('strong', null, completionPct + '%')
        ),
        h('div', null,
          h('span', null, 'Study Streak'),
          h('strong', { style: { color: streaks.current > 0 ? '#d9480f' : '#2b2b2b' } },
            (streaks.current > 0 ? '🔥 ' : '⏳ ') + streaks.current + ' day' + (streaks.current === 1 ? '' : 's')
          )
        )
      ),

      // Goal Progress Bar
      h('div', { className: 'sc-track' },
        h('div', {
          className: 'sc-fill' + (completionPct >= 70 ? ' green' : ''),
          style: { width: completionPct + '%' }
        })
      ),

      // Visualization (Weekly Bar Chart vs Monthly Heatmap)
      viewRange === 'week'
        ? h(WeeklyBarChart, { days: daysData, goal: goalMin })
        : h(MonthlyHeatmap, { days: daysData, goal: goalMin }),

      // Friendly Progress Message
      h('p', { className: 'sc-msg' },
        motivationMsg + ' (' + daysHitGoal + ' of ' + numDays + ' days hit target).'
      ),

      // Quick Session Logging Form
      h('form', { className: 'sc-form', onSubmit: handleLogSession },
        h('input', {
          type: 'number',
          min: 1,
          max: 600,
          placeholder: 'Minutes (e.g. 45)',
          value: logMinutes,
          onChange: function (e) { setLogMinutes(e.target.value); }
        }),
        h('input', {
          type: 'text',
          placeholder: 'Subject (e.g. DBMS, DSA, Web Dev)',
          value: logSubject,
          onChange: function (e) { setLogSubject(e.target.value); }
        }),
        h('button', { type: 'submit', className: 'btn-add-task' },
          '+ Log Study Session'
        ),
        h('button', {
          type: 'button',
          className: 'sc-filter',
          onClick: handleChangeGoal
        }, 'Set Daily Goal (' + goalMin + 'm)')
      ),

      feedbackMsg ? h('p', {
        style: { color: '#5c7c46', fontSize: '0.85rem', fontWeight: 600, marginTop: '8px' }
      }, feedbackMsg) : null
    );
  }

  // Mount React Component into existing DOM
  function mountConsistency() {
    var container = document.getElementById('studyConsistencyRoot');
    if (container) {
      var root = ReactDOM.createRoot(container);
      root.render(h(StudyConsistencyApp));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountConsistency);
  } else {
    mountConsistency();
  }
})();
