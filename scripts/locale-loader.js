/*
 * MYNT locale loader: load only English (fallback) + the saved language,
 * instead of all locale files on every new tab. Changing language saves the
 * choice and reloads the page, which then loads the new locale file.
 */
(function () {
    var MYNT_LOCALE_CODES = ["en","pt","ne","es","hi","hu","zh","zh_TW","cs","it","tr","bn","vi","ru","uz","ja","ko","idn","mr","fr","az","sl","ur","de","fa","ar_SA","el","ta","th","pl","uk","sv"];
    var DEFAULT = "zh_TW";
    var saved = null;
    try { saved = localStorage.getItem("selectedLanguage"); } catch (e) {}
    var lang = MYNT_LOCALE_CODES.indexOf(saved) >= 0 ? saved : DEFAULT;
    var load = lang === "en" ? ["en"] : ["en", lang];
    window.MYNT_LOCALE_CODES = MYNT_LOCALE_CODES;
    for (var i = 0; i < load.length; i++) {
        document.write('<script src="locales/' + load[i] + '.js"><\/script>');
    }
})();
