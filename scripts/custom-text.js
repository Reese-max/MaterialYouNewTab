/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

const POLICE_EXAM_COUNTDOWN = Object.freeze({
    preparationStart: Date.parse("2026-09-09T00:00:00+08:00"),
    registrationStart: Date.parse("2027-03-09T00:00:00+08:00"),
    registrationEnd: Date.parse("2027-03-19T00:00:00+08:00"),
    fullCourseStart: Date.parse("2027-01-01T00:00:00+08:00"),
    writingStart: Date.parse("2027-04-01T00:00:00+08:00"),
    finalReviewStart: Date.parse("2027-05-03T00:00:00+08:00"),
    examStart: Date.parse("2027-06-12T00:00:00+08:00"),
    examEnd: Date.parse("2027-06-14T00:00:00+08:00"),
});

function getPoliceExamCopy() {
    const language = (localStorage.getItem("selectedLanguage") || document.documentElement.lang || "en")
        .replace("_", "-")
        .toLowerCase();
    const isTraditionalChinese = language === "zh-tw";

    return isTraditionalChinese
        ? {
            title: "116 年三等警察特考",
            days: "天",
            examDate: "2027/6/12 開考",
            registrationIn: (days) => `距報名 ${days} 天`,
            registrationOpen: "報名期間 2027/3/9–3/18",
            registrationClosed: "報名已截止",
            phasePrefix: "目前階段",
            phases: {
                foundation: "打底期｜現在～12 月",
                fullCourse: "全科完成期｜1～3 月",
                writing: "申論＋考古題期｜4 月～5/2",
                finalReview: "最後 40 天｜模擬考＋背誦",
                exam: "考試進行中｜穩定作答",
                done: "本次考試已結束",
            },
            progress: (value) => `備考進度 ${value}%`,
            examToday: "今天開考",
            examFinished: "考試已結束",
        }
        : {
            title: "2027 Senior Police Examination",
            days: "days",
            examDate: "Exam starts Jun 12, 2027",
            registrationIn: (days) => `${days} days until registration`,
            registrationOpen: "Registration: Mar 9–18, 2027",
            registrationClosed: "Registration closed",
            phasePrefix: "Current phase",
            phases: {
                foundation: "Foundation｜through December",
                fullCourse: "Complete all subjects｜Jan–Mar",
                writing: "Essays + past papers｜Apr–May 2",
                finalReview: "Final 40 days｜mocks + recall",
                exam: "Exam in progress｜stay steady",
                done: "This examination has ended",
            },
            progress: (value) => `Preparation progress ${value}%`,
            examToday: "Exam starts today",
            examFinished: "Exam finished",
        };
}

function getPoliceExamPhase(now) {
    if (now >= POLICE_EXAM_COUNTDOWN.examEnd) return "done";
    if (now >= POLICE_EXAM_COUNTDOWN.examStart) return "exam";
    if (now >= POLICE_EXAM_COUNTDOWN.finalReviewStart) return "finalReview";
    if (now >= POLICE_EXAM_COUNTDOWN.writingStart) return "writing";
    if (now >= POLICE_EXAM_COUNTDOWN.fullCourseStart) return "fullCourse";
    return "foundation";
}

function daysUntil(timestamp, now) {
    return Math.max(0, Math.ceil((timestamp - now) / 86400000));
}

function ensurePoliceExamCountdownStyles() {
    if (document.getElementById("policeExamCountdownStyles")) return;

    const style = document.createElement("style");
    style.id = "policeExamCountdownStyles";
    style.textContent = `
        #policeExamCountdownCard {
            position: fixed;
            top: max(20px, env(safe-area-inset-top));
            right: max(20px, env(safe-area-inset-right));
            z-index: 3;
            width: min(320px, calc(100vw - 40px));
            padding: 14px 16px;
            border-radius: 24px;
            color: var(--textColorDark-blue);
            background: color-mix(in srgb, var(--accentLightTint-blue) 78%, transparent);
            -webkit-backdrop-filter: blur(18px) saturate(150%);
            backdrop-filter: blur(18px) saturate(150%);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
            text-align: left;
            line-height: 1.35;
            user-select: none;
        }

        #policeExamCountdownCard .exam-countdown-title {
            font-size: 0.8rem;
            font-weight: 600;
            opacity: 0.8;
        }

        #policeExamCountdownCard .exam-countdown-main {
            display: flex;
            align-items: baseline;
            gap: 7px;
            margin-top: 3px;
        }

        #policeExamCountdownCard .exam-countdown-days {
            font-size: clamp(2rem, 4vw, 2.65rem);
            font-weight: 700;
            letter-spacing: -0.05em;
        }

        #policeExamCountdownCard .exam-countdown-unit {
            font-size: 0.95rem;
            font-weight: 600;
        }

        #policeExamCountdownCard .exam-countdown-meta,
        #policeExamCountdownCard .exam-countdown-phase {
            margin-top: 5px;
            font-size: 0.76rem;
            opacity: 0.84;
        }

        #policeExamCountdownCard .exam-countdown-phase {
            font-weight: 600;
        }

        #policeExamCountdownCard .exam-countdown-progress {
            height: 5px;
            margin-top: 10px;
            overflow: hidden;
            border-radius: 999px;
            background: color-mix(in srgb, var(--textColorDark-blue) 14%, transparent);
        }

        #policeExamCountdownCard .exam-countdown-progress-value {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: var(--darkColor-blue);
        }

        @media (max-width: 720px) {
            #policeExamCountdownCard {
                top: max(10px, env(safe-area-inset-top));
                right: max(10px, env(safe-area-inset-right));
                width: min(290px, calc(100vw - 20px));
                padding: 11px 13px;
                border-radius: 20px;
            }

            #policeExamCountdownCard .exam-countdown-days {
                font-size: 1.85rem;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #policeExamCountdownCard,
            #policeExamCountdownCard * {
                transition: none !important;
                animation: none !important;
            }
        }
    `;
    document.head.appendChild(style);
}

function ensurePoliceExamCountdownCard() {
    let card = document.getElementById("policeExamCountdownCard");
    if (card) return card;

    card = document.createElement("section");
    card.id = "policeExamCountdownCard";
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.setAttribute("aria-atomic", "true");

    const title = document.createElement("div");
    title.className = "exam-countdown-title";

    const main = document.createElement("div");
    main.className = "exam-countdown-main";

    const days = document.createElement("strong");
    days.className = "exam-countdown-days";

    const unit = document.createElement("span");
    unit.className = "exam-countdown-unit";

    const meta = document.createElement("div");
    meta.className = "exam-countdown-meta";

    const phase = document.createElement("div");
    phase.className = "exam-countdown-phase";

    const progress = document.createElement("div");
    progress.className = "exam-countdown-progress";

    const progressValue = document.createElement("span");
    progressValue.className = "exam-countdown-progress-value";
    progress.appendChild(progressValue);

    main.append(days, unit);
    card.append(title, main, meta, phase, progress);
    document.body.appendChild(card);
    return card;
}

function updatePoliceExamCountdown() {
    ensurePoliceExamCountdownStyles();
    const card = ensurePoliceExamCountdownCard();
    const copy = getPoliceExamCopy();
    const now = Date.now();
    const remainingDays = daysUntil(POLICE_EXAM_COUNTDOWN.examStart, now);
    const registrationDays = daysUntil(POLICE_EXAM_COUNTDOWN.registrationStart, now);
    const phaseKey = getPoliceExamPhase(now);

    const totalPreparation = POLICE_EXAM_COUNTDOWN.examStart - POLICE_EXAM_COUNTDOWN.preparationStart;
    const elapsedPreparation = Math.min(
        totalPreparation,
        Math.max(0, now - POLICE_EXAM_COUNTDOWN.preparationStart),
    );
    const progressPercent = Math.round((elapsedPreparation / totalPreparation) * 100);

    const title = card.querySelector(".exam-countdown-title");
    const days = card.querySelector(".exam-countdown-days");
    const unit = card.querySelector(".exam-countdown-unit");
    const meta = card.querySelector(".exam-countdown-meta");
    const phase = card.querySelector(".exam-countdown-phase");
    const progress = card.querySelector(".exam-countdown-progress");
    const progressValue = card.querySelector(".exam-countdown-progress-value");

    title.textContent = copy.title;
    days.textContent = now >= POLICE_EXAM_COUNTDOWN.examEnd ? "✓" : String(remainingDays);
    unit.textContent = now >= POLICE_EXAM_COUNTDOWN.examStart
        ? (now < POLICE_EXAM_COUNTDOWN.examEnd ? copy.examToday : copy.examFinished)
        : copy.days;

    let registrationText = copy.registrationClosed;
    if (now < POLICE_EXAM_COUNTDOWN.registrationStart) {
        registrationText = copy.registrationIn(registrationDays);
    } else if (now < POLICE_EXAM_COUNTDOWN.registrationEnd) {
        registrationText = copy.registrationOpen;
    }

    meta.textContent = `${copy.examDate} · ${registrationText}`;
    phase.textContent = `${copy.phasePrefix}：${copy.phases[phaseKey]}`;
    progress.setAttribute("aria-label", copy.progress(progressPercent));
    progressValue.style.width = `${progressPercent}%`;
    progress.hidden = now >= POLICE_EXAM_COUNTDOWN.examStart;
}

// Custom text
document.addEventListener("DOMContentLoaded", () => {
    const userTextDiv = document.getElementById("userText");
    const userTextCheckbox = document.getElementById("userTextCheckbox");

    // Load and apply the checkbox state
    const isUserTextVisible = localStorage.getItem("userTextVisible") !== "false";
    userTextCheckbox.checked = isUserTextVisible;
    userTextDiv.style.display = isUserTextVisible ? "block" : "none";

    // Toggle userText display based on checkbox state
    userTextCheckbox.addEventListener("change", () => {
        const isVisible = userTextCheckbox.checked;
        userTextDiv.style.display = isVisible ? "block" : "none";
        localStorage.setItem("userTextVisible", isVisible);
    });

    // Set the default language to English if no language is saved
    const savedLang = localStorage.getItem("selectedLanguage") || "en";
    applyLanguage(savedLang);

    // Load the stored text if it exists
    const storedValue = localStorage.getItem("userText");
    if (storedValue) {
        userTextDiv.textContent = storedValue;
    } else {
        // Fallback to the placeholder based on the selected language
        const placeholder = userTextDiv.dataset.placeholder || translations["en"].userText; // Fallback to English
        userTextDiv.textContent = placeholder;
    }

    // Handle input event
    userTextDiv.addEventListener("input", function () {
        localStorage.setItem("userText", userTextDiv.textContent);
    });

    // Remove placeholder text when the user starts editing
    userTextDiv.addEventListener("click", function () {
        if (userTextDiv.textContent === userTextDiv.dataset.placeholder) {
            userTextDiv.textContent = "";  // Clear the placeholder when focused
        }
    });

    // Restore placeholder if the user leaves the div empty after editing
    userTextDiv.addEventListener("blur", function () {
        if (userTextDiv.textContent === "") {
            userTextDiv.textContent = userTextDiv.dataset.placeholder;  // Show the placeholder again if empty
        }
    });

    updatePoliceExamCountdown();
    window.setInterval(updatePoliceExamCountdown, 15 * 60 * 1000);
});