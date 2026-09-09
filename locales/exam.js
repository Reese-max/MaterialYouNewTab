/* MYNT exam UI locale extension. English baseline + Traditional Chinese parity. GPL-3.0. */
(function (root) {
    'use strict';

    const enExam = {
        examTitle: '2027 Police Examination (Level 3)', subtitle: 'Police Information Management',
        milestone: 'MY NEXT MILESTONE', days: 'days', dayN: 'Day {n}', finished: 'Finished',
        examDate: 'Written exam', registrationIn: 'Registration in', registrationDates: 'Registration',
        registrationOpen: 'Registration open', registrationClosed: 'Registration closed',
        reminder: 'Date reminder only; check the official closing time.',
        examStatus: 'Written exam in progress', finishedStatus: 'This written exam has ended',
        foundation: 'Foundation', allSubjects: 'All subjects', writing: 'Essays + past papers', final: 'Final 40 days',
        custom: 'Custom exam schedule', phaseRail: 'Foundation → Subjects → Essays → Review',
        phaseNote: 'Study phase, not learning completion.', foundationUntil: 'Through Dec 31',
        allSubjectsUntil: 'Through Mar 31', writingUntil: 'Through May 2', finalUntil: 'Through Jun 11', customUntil: '',
        settings: 'Exam countdown', openSettings: 'Countdown settings', close: 'Close', save: 'Save settings', cancel: 'Cancel',
        intro: 'A useful reminder, without the distraction.', titleLabel: 'Exam name', examStart: 'First exam day',
        examEnd: 'Last exam day', registrationStart: 'Registration opens', registrationEnd: 'Registration closes',
        enabled: 'Show countdown', enabledHelp: 'Keep the reminder separate from the toolbar.',
        registration: 'Show registration reminder', registrationHelp: 'On-page reminder, without system notifications.',
        phase: 'Show study timeline', phaseHelp: 'Elapsed time is not study completion.', compact: 'Compact display',
        compactHelp: 'Show only the title, days and exam dates.', useWallpaper: 'Use existing wallpaper',
        wallpaperHelp: 'Keep your saved wallpaper or video instead of the Figma petals.',
        timezone: 'Asia/Taipei · calendar-day countdown',
        timezoneHelp: 'Refreshes at midnight and when you return. Dates are editable; refer to official announcements.',
        disclaimer: 'Based on your dates · refer to official announcements',
        local: 'Your new tab, stored on this browser.', localSettings: 'Settings stay on this browser and are included in local backups.',
        greeting: 'A new page. A little more focus.', daily: 'Classic', study: 'Study', work: 'Work', relax: 'Relax',
        returnStudy: 'Study homepage', bookmarks: 'Bookmarks', apps: 'Google apps', appearance: 'Appearance',
        wallpaper: 'Wallpaper', tools: 'All tools', focus: 'Open focus timer', focusHelp: 'Open the existing Pomodoro timer',
        command: 'Command palette', searchPlaceholder: 'Search Google or use ! shortcuts', hidden: 'Countdown hidden',
        invalidSettings: 'Saved settings are invalid. Defaults are shown; the saved data has not been overwritten.',
        invalidTitle: 'Enter an exam name between 1 and 80 characters.', invalidDate: 'Enter valid dates from 2000 to 2100.',
        invalidOrder: 'End dates must follow start dates, and registration must finish before the exam.',
        storageError: 'Settings could not be saved. Check browser storage and try again.',
        stale: 'Settings changed in another tab. Close and reopen this panel before saving.', saved: 'Settings saved.',
        workspaceMissing: 'Manage workspaces in Control Center.', noNotifications: 'No system notifications',
        editHint: 'Edit your greeting', presetNote: 'The study phases apply to the June 12, 2027 preset. Custom dates show a custom schedule.'
    };

    const zhTWExam = {
        examTitle: '116 年三等警察特考', subtitle: '警察資訊管理人員', milestone: '我的下一個目標',
        days: '天', dayN: '第 {n} 天', finished: '已結束', examDate: '距離筆試', registrationIn: '距離報名',
        registrationDates: '報名期間', registrationOpen: '報名開放中', registrationClosed: '報名已截止',
        reminder: '僅作日期提醒，請依公告確認截止時間。', examStatus: '筆試進行中', finishedStatus: '本次筆試已結束',
        foundation: '打底期', allSubjects: '全科完成期', writing: '申論＋考古題期', final: '最後 40 天',
        custom: '自訂考試時程', phaseRail: '打底 → 全科 → 申論 → 衝刺', phaseNote: '備考階段，不代表讀書完成率。',
        foundationUntil: '至 12/31', allSubjectsUntil: '至 3/31', writingUntil: '至 5/2', finalUntil: '至 6/11', customUntil: '',
        settings: '考試倒數', openSettings: '倒數設定', close: '關閉', save: '儲存設定', cancel: '取消',
        intro: '讓提醒剛好，不打擾每一次開啟。', titleLabel: '考試名稱', examStart: '筆試首日', examEnd: '筆試末日',
        registrationStart: '開始報名', registrationEnd: '報名截止', enabled: '在新分頁顯示',
        enabledHelp: '倒數卡片與工具列分開，不遮住書籤。', registration: '顯示報名提醒',
        registrationHelp: '只在新分頁提示，不發送系統通知。', phase: '顯示備考時間軸',
        phaseHelp: '時間經過，不等於讀書完成率。', compact: '精簡顯示', compactHelp: '只保留考試名稱、天數與日期。',
        useWallpaper: '使用原本桌布', wallpaperHelp: '保留你設定的桌布或影片，取代 Figma 抽象花瓣。',
        timezone: 'Asia/Taipei · 依臺北日期計算',
        timezoneHelp: '跨日、重新開啟或回到分頁時更新；日期可修改，仍以考選部公告為準。',
        disclaimer: '依設定日期計算 · 以考選部公告為準', local: '留在本機，只屬於你的新分頁。',
        localSettings: '設定保存在這台瀏覽器，並納入本機備份。', greeting: '新的一頁，專注當下。',
        daily: '日常', study: '備考', work: '工作', relax: '休息', returnStudy: '備考首頁',
        bookmarks: '書籤', apps: 'Google 應用程式', appearance: '外觀', wallpaper: '更換桌布', tools: '全部工具',
        focus: '開啟專注計時', focusHelp: '開啟原有番茄鐘，不會另建計時器', command: '命令面板',
        searchPlaceholder: '搜尋 Google，或使用 ! 捷徑', hidden: '已隱藏倒數卡片',
        invalidSettings: '儲存的設定無法讀取，目前顯示預設值；原資料尚未被覆寫。',
        invalidTitle: '請輸入 1～80 字的考試名稱。', invalidDate: '請輸入 2000～2100 年間的有效日期。',
        invalidOrder: '末日不得早於首日，且報名截止日必須早於考試首日。',
        storageError: '無法儲存設定，請檢查瀏覽器儲存空間後重試。',
        stale: '另一個分頁已變更設定，請關閉並重新開啟設定後再儲存。', saved: '設定已儲存。',
        workspaceMissing: '請到控制中心管理工作區。', noNotifications: '不發送系統通知',
        editHint: '編輯自訂文字', presetNote: '四階段時間軸適用於 2027/6/12 預設考試；其他日期顯示自訂時程。'
    };

    const api = Object.freeze({ en: enExam, zh_TW: zhTWExam });
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
        return;
    }

    // Extend the existing locale catalog after languages.js has built its
    // English-fallback objects. This keeps the exam UI on the same locale path
    // as the rest of MYNT while allowing upstream locale files to remain intact.
    const catalog = typeof translations !== 'undefined' ? translations : null;
    if (catalog) {
        if (catalog.en) catalog.en.examDashboard = enExam;
        if (catalog.zh_TW) catalog.zh_TW.examDashboard = zhTWExam;
        for (const strings of Object.values(catalog)) {
            if (!strings.examDashboard) strings.examDashboard = enExam;
        }
    }

    const dictionaries = {};
    if (catalog) {
        for (const [code, strings] of Object.entries(catalog)) {
            dictionaries[code] = strings.examDashboard || enExam;
        }
    } else {
        dictionaries.en = enExam;
        dictionaries.zh_TW = zhTWExam;
    }
    root.MyntExamCopy = Object.freeze(dictionaries);
})(typeof globalThis !== 'undefined' ? globalThis : this);
