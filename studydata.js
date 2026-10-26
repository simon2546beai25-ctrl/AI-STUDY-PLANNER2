/* ==========================================================================
   AI Study Planner - Centralized Shared Study Data Service
   LocalStorage Persistence, Non-sensitive Data, Gamification (XP, Streaks, Badges)
   Browser-compatible Vanilla JavaScript - Available as window.StudyData & window.SP
   ========================================================================== */

(function (root) {
  'use strict';

  var KEYS = {
    sessions: 'sp_sessions',
    dailyGoalMin: 'sp_dailyGoalMin',
    xp: 'sp_xp',
    awarded: 'sp_awarded',
    badges: 'sp_badges',
    games: 'sp_games',
    tasks: 'studyPlannerTasks',
    plan: 'sp_plan',
    subjects: 'sp_subjects'
  };

  function read(key, fallback) {
    try {
      var item = localStorage.getItem(key);
      if (item === null || item === undefined) return fallback;
      return JSON.parse(item);
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // Format date to local calendar date YYYY-MM-DD
  function dkey(d) {
    var dt = d ? new Date(d) : new Date();
    if (isNaN(dt.getTime())) dt = new Date();
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function parseDate(str) {
    if (!str || typeof str !== 'string') return new Date();
    var parts = str.split('-');
    if (parts.length !== 3) return new Date();
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  // Return all valid recorded study sessions (filter out malformed or future dates)
  function getSessions() {
    var list = read(KEYS.sessions, []);
    if (!Array.isArray(list)) return [];
    var todayStr = dkey();
    return list.filter(function (s) {
      return s && typeof s.minutes === 'number' && s.minutes > 0 &&
             typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
             s.date <= todayStr;
    });
  }

  function realSessions() {
    return getSessions().filter(function (s) { return !s.demo; });
  }

  function minutesOn(dateStr) {
    return getSessions().reduce(function (sum, s) {
      return s.date === dateStr ? sum + s.minutes : sum;
    }, 0);
  }

  // Return array of { date, label, min, minutes, day } for past N days ending today
  function lastDays(n) {
    n = n || 7;
    var out = [];
    var now = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var key = dkey(target);
      var m = minutesOn(key);
      out.push({
        date: key,
        day: target.getDate(),
        label: target.toLocaleDateString(undefined, { weekday: 'short' }),
        min: m,
        minutes: m
      });
    }
    return out;
  }

  // Real calendar-based study streak calculation
  function calculateStreaks() {
    var activeDates = {};
    getSessions().forEach(function (s) {
      if (s.minutes > 0) activeDates[s.date] = true;
    });

    var keys = Object.keys(activeDates).sort();
    var longest = 0;
    var run = 0;
    var prev = null;

    keys.forEach(function (k) {
      var cur = parseDate(k);
      if (prev && Math.round((cur - prev) / 864e5) === 1) {
        run++;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = cur;
    });

    // Current streak: counts consecutive days backwards
    var curStreak = 0;
    var pointer = new Date();
    pointer = new Date(pointer.getFullYear(), pointer.getMonth(), pointer.getDate());
    var todayKey = dkey(pointer);

    // If today is not studied yet, streak from yesterday is still alive today
    if (!activeDates[todayKey]) {
      pointer.setDate(pointer.getDate() - 1);
    }

    while (activeDates[dkey(pointer)]) {
      curStreak++;
      pointer.setDate(pointer.getDate() - 1);
    }

    return {
      current: curStreak,
      longest: Math.max(longest, curStreak)
    };
  }

  var BADGES_DEF = [
    {
      id: 'first',
      name: 'First Step',
      desc: 'Complete your first study session',
      icon: 'bx-run',
      check: function () { return getSessions().length >= 1; }
    },
    {
      id: 'consistency',
      name: 'Consistency Starter',
      desc: 'Study on 3 separate days',
      icon: 'bx-calendar-check',
      check: function () {
        var days = {};
        getSessions().forEach(function (s) { days[s.date] = 1; });
        return Object.keys(days).length >= 3;
      }
    },
    {
      id: 'focus',
      name: 'Focus Master',
      desc: 'Complete 10 focus sessions',
      icon: 'bx-target-lock',
      check: function () { return getSessions().length >= 10; }
    },
    {
      id: 'tasks',
      name: 'Task Finisher',
      desc: 'Complete 10 tasks',
      icon: 'bx-task',
      check: function () {
        var awarded = read(KEYS.awarded, {});
        var taskAwards = Object.keys(awarded).filter(function (k) { return k.indexOf('task:') === 0; });
        return taskAwards.length >= 10;
      }
    },
    {
      id: 'brain',
      name: 'Brain Trainer',
      desc: 'Finish 5 brain gym games',
      icon: 'bx-brain',
      check: function () {
        var g = read(KEYS.games, { plays: 0 });
        return (g.plays || 0) >= 5;
      }
    },
    {
      id: 'quiz',
      name: 'Quiz Champion',
      desc: 'Achieve a perfect score (5/5 or 100%) in a challenge',
      icon: 'bx-trophy',
      check: function () {
        var awarded = read(KEYS.awarded, {});
        return Boolean(awarded['badge:quiz_earned']);
      }
    }
  ];

  // Award XP for a unique action once
  function awardXP(actionId, xp) {
    if (!actionId || xp <= 0) return false;
    var awarded = read(KEYS.awarded, {});
    if (awarded[actionId]) return false;

    awarded[actionId] = Date.now();
    write(KEYS.awarded, awarded);

    var currentXP = +read(KEYS.xp, 0) || 0;
    write(KEYS.xp, currentXP + xp);
    return true;
  }

  // Check and unlock eligible badges
  function checkBadges() {
    var unlocked = read(KEYS.badges, {});
    if (!unlocked || typeof unlocked !== 'object') unlocked = {};
    var changed = false;

    BADGES_DEF.forEach(function (b) {
      if (!unlocked[b.id] && b.check()) {
        unlocked[b.id] = Date.now();
        awardXP('badge:' + b.id, 50);
        changed = true;
      }
    });

    if (changed) {
      write(KEYS.badges, unlocked);
    }
  }

  var SEED_TASKS = [
    { id: 1, title: 'Complete DBMS Normalization Assignment', subject: 'DBMS', deadline: '', priority: 'high', estimate: 45, status: 'Pending', completed: false },
    { id: 2, title: 'Revise Binary Trees & Graph Traversal', subject: 'Data Structures', deadline: '', priority: 'medium', estimate: 60, status: 'Pending', completed: false },
    { id: 3, title: 'Practice JavaScript DOM Manipulation', subject: 'Web Dev', deadline: '', priority: 'medium', estimate: 30, status: 'Pending', completed: false },
    { id: 4, title: 'Read Operating Systems CPU Scheduling', subject: 'OS', deadline: '', priority: 'low', estimate: 40, status: 'Pending', completed: false },
    { id: 5, title: 'Submit Mini Project Source Code', subject: 'Project', deadline: '', priority: 'high', estimate: 90, status: 'Pending', completed: false }
  ];

  function getTasks() {
    var raw = localStorage.getItem(KEYS.tasks);
    if (raw === null) {
      write(KEYS.tasks, SEED_TASKS);
      return SEED_TASKS.slice();
    }
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveTasks(tasks) {
    write(KEYS.tasks, tasks);
  }

  function getDailyGoal() {
    var g = +read(KEYS.dailyGoalMin, 120);
    return (g > 0 && g <= 960) ? g : 120;
  }

  function setDailyGoal(m) {
    m = Math.round(+m);
    if (m >= 15 && m <= 960) {
      write(KEYS.dailyGoalMin, m);
      return true;
    }
    return false;
  }

  function getGamesData() {
    var g = read(KEYS.games, { plays: 0, best: {} });
    if (!g || typeof g !== 'object') g = { plays: 0, best: {} };
    if (typeof g.plays !== 'number') g.plays = 0;
    if (!g.best || typeof g.best !== 'object') g.best = {};
    return g;
  }

  // Record a completed study session
  function recordSession(minutes, subject, sessionId) {
    minutes = Math.round(+minutes);
    if (!(minutes > 0)) return false;

    var sList = read(KEYS.sessions, []);
    if (!Array.isArray(sList)) sList = [];

    var id = sessionId || ('s_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));
    var sessionObj = {
      id: id,
      date: dkey(),
      minutes: minutes,
      subject: (subject && subject.trim()) ? subject.trim() : 'General Study',
      ts: Date.now()
    };

    sList.push(sessionObj);
    write(KEYS.sessions, sList);

    var xpEarned = 10 + Math.floor(minutes / 5);
    awardXP('session:' + id, xpEarned);

    checkBadges();
    return true;
  }

  // Mark task completed and award XP
  function completeTask(taskId) {
    if (!taskId) return;
    awardXP('task:' + taskId, 20);
    checkBadges();
  }

  // Record a completed Brain Gym game
  function recordGame(gameName, score, maxScore) {
    var g = getGamesData();
    g.plays = (g.plays || 0) + 1;
    var prev = g.best[gameName] || 0;
    if (score > prev) {
      g.best[gameName] = score;
    }
    write(KEYS.games, g);

    var gameId = 'game:' + Date.now();
    var xp = 10 + Math.max(0, score * 3);
    awardXP(gameId, xp);

    if (score >= maxScore && maxScore >= 5) {
      var awarded = read(KEYS.awarded, {});
      awarded['badge:quiz_earned'] = Date.now();
      write(KEYS.awarded, awarded);
    }

    checkBadges();
  }

  // Load realistic demo history for the last 10 days
  function loadDemoData() {
    var subs = ['Data Structures', 'Database Systems', 'Operating Systems', 'Web Development', 'AI & ML'];
    var existing = read(KEYS.sessions, []).filter(function (s) { return !s.demo; });
    var now = new Date();

    for (var i = 1; i <= 9; i++) {
      if (i === 4) continue;
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var min = 45 + ((i * 17) % 65);
      existing.push({
        id: 'demo_' + i,
        demo: true,
        date: dkey(d),
        minutes: min,
        subject: subs[i % subs.length],
        ts: d.getTime()
      });
    }

    write(KEYS.sessions, existing);
    checkBadges();
  }

  function resetAll() {
    Object.keys(KEYS).forEach(function (k) {
      localStorage.removeItem(KEYS[k]);
    });
    write(KEYS.tasks, SEED_TASKS);
  }

  function getStats() {
    checkBadges();
    var xp = +read(KEYS.xp, 0) || 0;
    var unlocked = read(KEYS.badges, {});
    var streaks = calculateStreaks();
    var level = Math.floor(xp / 100) + 1;
    var nextLevelXP = level * 100;
    var curLevelXP = xp % 100;

    return {
      xp: xp,
      level: level,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      current: streaks.current,
      longest: streaks.longest,
      curLevelXP: curLevelXP,
      nextLevelXP: nextLevelXP,
      unlocked: BADGES_DEF.filter(function (b) { return unlocked && unlocked[b.id]; })
    };
  }

  var Service = {
    K: KEYS,
    read: read,
    write: write,
    dkey: dkey,
    parseDate: parseDate,
    sessions: getSessions,
    realSessions: realSessions,
    minutesOn: minutesOn,
    lastDays: lastDays,
    streaks: calculateStreaks,
    badges: BADGES_DEF,
    getGoal: getDailyGoal,
    setGoal: setDailyGoal,
    goal: getDailyGoal,
    tasks: getTasks,
    saveTasks: saveTasks,
    recordSession: recordSession,
    addSession: recordSession,
    completeTask: completeTask,
    recordGame: recordGame,
    games: getGamesData,
    award: awardXP,
    awardXP: awardXP,
    checkBadges: checkBadges,
    stats: getStats,
    loadDemo: loadDemoData,
    reset: resetAll,
    hasAny: function () { return getSessions().length > 0; },
    hasDemo: function () { return getSessions().some(function (s) { return s.demo; }); },
    isDemo: function () { return getSessions().some(function (s) { return s.demo; }); }
  };

  root.StudyData = Service;
  root.SP = Service;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
