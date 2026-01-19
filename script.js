// ▼▼▼ あなたのリポジトリ名に修正してください！ ▼▼▼
const GH_CONFIG = {
    owner: "souta-624",
    repo: "school",   // ← ここを確認！
    path: "data.json"
};

const DEFAULT_ADMIN_DATA = {
    timeSettings: [
        { p: 1, s: "08:50", e: "09:40" },
        { p: 2, s: "09:50", e: "10:40" },
        { p: 3, s: "10:50", e: "11:40" },
        { p: 4, s: "11:50", e: "12:40" },
        { p: 5, s: "13:30", e: "14:20" },
        { p: 6, s: "14:30", e: "15:20" }
    ],
    schedule: {},
    tests: []
};

class App {
    constructor() {
        this.adminData = JSON.parse(JSON.stringify(DEFAULT_ADMIN_DATA));
        // ユーザー設定 (初期値21HR)
        const savedUser = localStorage.getItem('school_user_settings');
        this.userData = savedUser ? JSON.parse(savedUser) : { 
            classId: '21HR', 
            calendarId: 'japanese__ja@holiday.calendar.google.com',
            todos: []
        };
        this.timeLeft = 25 * 60;
        this.timer = null;
    }

    async init() {
        await this.loadFromGitHub();
        this.setupEvents();
        this.startClock();
        this.renderDashboard();
        this.renderTodos();
        this.navigate('dashboard');
    }

    async loadFromGitHub() {
        try {
            const url = `https://raw.githubusercontent.com/${GH_CONFIG.owner}/${GH_CONFIG.repo}/main/${GH_CONFIG.path}?t=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if(data.timeSettings) this.adminData = data;
            }
        } catch (e) { console.log("初期データを使用"); }
    }

    async saveToGitHub() {
        const token = document.getElementById('ghToken').value;
        if (!token) return alert("GitHubトークンが必要です");

        // 管理者入力を反映
        const tName = document.getElementById('adminTestName').value;
        const tDate = document.getElementById('adminTestDate').value;
        if (tName && tDate) this.adminData.tests = [{ name: tName, date: tDate }];

        const apiUrl = `https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`;
        try {
            const getRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}` } });
            const sha = getRes.ok ? (await getRes.json()).sha : null;
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(this.adminData, null, 2))));
            
            const res = await fetch(apiUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "Admin Update", content, sha })
            });

            if (res.ok) { alert("保存しました！"); this.renderDashboard(); }
            else alert("保存失敗。トークンを確認してください。");
        } catch (e) { alert("通信エラー"); }
    }

    saveUserSettings() {
        const cls = document.getElementById('userClassSelect').value;
        const cal = document.getElementById('userCalendarId').value;
        this.userData.classId = cls;
        this.userData.calendarId = cal || 'japanese__ja@holiday.calendar.google.com';
        
        localStorage.setItem('school_user_settings', JSON.stringify(this.userData));
        alert("設定を保存しました。");
        this.renderDashboard();
        this.navigate('dashboard');
    }

    setupEvents() {
        // --- クラス選択肢を生成 (21HR - 28HR) ---
        const classSelect = document.getElementById('userClassSelect');
        classSelect.innerHTML = "";
        for (let i = 1; i <= 8; i++) {
            const clsName = `2${i}HR`; // 21HR ~ 28HR
            const opt = document.createElement('option');
            opt.value = clsName;
            opt.textContent = clsName;
            classSelect.appendChild(opt);
        }

        // 画面遷移
        document.getElementById('adminLoginBtn').onclick = () => this.navigate('admin-login');
        document.getElementById('userSettingsBtn').onclick = () => {
            document.getElementById('userClassSelect').value = this.userData.classId;
            document.getElementById('userCalendarId').value = this.userData.calendarId;
            this.navigate('user-settings');
        };

        // アクション
        document.getElementById('adminLoginSubmit').onclick = () => {
            if(document.getElementById('adminPinInput').value === '1234') {
                if(this.adminData.tests[0]) {
                    document.getElementById('adminTestName').value = this.adminData.tests[0].name;
                    document.getElementById('adminTestDate').value = this.adminData.tests[0].date;
                }
                this.navigate('admin');
            } else alert("パスワードが違います");
        };
        
        document.getElementById('saveAdminDataBtn').onclick = () => this.saveToGitHub();
        document.getElementById('saveUserSettingsBtn').onclick = () => this.saveUserSettings();

        // ToDo & Pomodoro
        document.getElementById('addTodoBtn').onclick = () => this.addTodo();
        document.getElementById('pomoStartBtn').onclick = () => this.toggleTimer();
        document.getElementById('pomoResetBtn').onclick = () => this.resetTimer();
    }

    renderDashboard() {
        // クラス名
        document.getElementById('displayClassName').textContent = this.userData.classId;

        // 時間割
        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const todayKey = dayMap[new Date().getDay()];
        const scheduleList = document.getElementById('scheduleList');
        const classSchedule = this.adminData.schedule[this.userData.classId] || {};
        const todaySubjects = classSchedule[todayKey] || [];

        if (todaySubjects.length > 0) {
            let html = '<ul style="list-style:none; padding:0; margin:0;">';
            todaySubjects.forEach((sub, i) => {
                html += `<li style="padding:5px 0; border-bottom:1px solid #f0f0f0; display:flex;">
                            <span style="width:30px; color:#aaa; font-weight:bold;">${i+1}</span>
                            <span>${sub}</span>
                         </li>`;
            });
            html += '</ul>';
            scheduleList.innerHTML = html;
        } else {
            scheduleList.innerHTML = '<p style="color:#aaa;">今日の授業はありません</p>';
        }

        // 次の授業
        this.updateNextClass(todaySubjects);

        // テストカウントダウン
        const testEl = document.getElementById('testCountdownDisplay');
        if (this.adminData.tests && this.adminData.tests[0]) {
            const test = this.adminData.tests[0];
            const diff = Math.ceil((new Date(test.date) - new Date()) / (86400000));
            const msg = diff > 0 ? `あと <span style="font-size:1.5em">${diff}</span> 日` : (diff === 0 ? "本日！" : "終了");
            testEl.innerHTML = `<div style="font-size:0.9em; margin-bottom:5px;">${test.name} まで</div>${msg}`;
        } else {
            testEl.textContent = "予定なし";
        }

        // カレンダー
        const calId = encodeURIComponent(this.userData.calendarId);
        const iframeSrc = `https://calendar.google.com/calendar/embed?height=400&wkst=1&bgcolor=%23ffffff&ctz=Asia%2FTokyo&showTitle=0&src=${calId}&color=%237986CB`;
        document.getElementById('googleCalendarFrame').src = iframeSrc;
    }

    updateNextClass(todaySubjects) {
        if (!todaySubjects.length) {
            document.getElementById('nextClassDisplay').textContent = "休日です";
            return;
        }
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        
        let found = false;
        for (let i = 0; i < this.adminData.timeSettings.length; i++) {
            const t = this.adminData.timeSettings[i];
            const [sH, sM] = t.s.split(':').map(Number);
            const [eH, eM] = t.e.split(':').map(Number);
            const startMins = sH * 60 + sM;
            const endMins = eH * 60 + eM;

            if (nowMins >= startMins && nowMins <= endMins) {
                const sub = todaySubjects[t.p - 1] || "空き";
                document.getElementById('nextClassDisplay').innerHTML = 
                    `<span style="color:var(--primary); font-weight:bold;">${t.p}限：${sub}</span><br><span style="font-size:0.8em">あと ${endMins - nowMins} 分で終了</span>`;
                found = true;
                break;
            }
            if (nowMins < startMins) {
                const sub = todaySubjects[t.p - 1] || "空き";
                document.getElementById('nextClassDisplay').innerHTML = 
                    `次は <span style="font-weight:bold;">${t.p}限：${sub}</span><br><span style="font-size:0.8em">${t.s} 開始</span>`;
                found = true;
                break;
            }
        }
        if (!found) document.getElementById('nextClassDisplay').textContent = "放課後です";
    }

    renderTodos() {
        const list = document.getElementById('todoList');
        list.innerHTML = "";
        let doneCount = 0;
        this.userData.todos.forEach((todo, idx) => {
            if(todo.done) doneCount++;
            const li = document.createElement('li');
            li.className = `todo-item ${todo.done ? 'done' : ''}`;
            li.innerHTML = `
                <input type="checkbox" ${todo.done ? 'checked' : ''} onchange="app.toggleTodo(${idx})">
                <span>${todo.text}</span>
                <button class="btn-del-todo" onclick="app.deleteTodo(${idx})"><i class="fa-solid fa-trash"></i></button>
            `;
            list.appendChild(li);
        });
        const total = this.userData.todos.length;
        document.getElementById('todoCount').textContent = `${doneCount}/${total}`;
        const pct = total === 0 ? 0 : (doneCount / total) * 100;
        document.getElementById('todoProgressBar').style.width = `${pct}%`;
    }

    addTodo() {
        const input = document.getElementById('newTodoInput');
        const text = input.value.trim();
        if(text) {
            this.userData.todos.push({ text: text, done: false });
            input.value = "";
            this.saveLocalTodos();
            this.renderTodos();
        }
    }
    toggleTodo(idx) {
        this.userData.todos[idx].done = !this.userData.todos[idx].done;
        this.saveLocalTodos();
        this.renderTodos();
    }
    deleteTodo(idx) {
        this.userData.todos.splice(idx, 1);
        this.saveLocalTodos();
        this.renderTodos();
    }
    saveLocalTodos() {
        localStorage.setItem('school_user_settings', JSON.stringify(this.userData));
    }
    
    navigate(viewId) {
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
    }
    startClock() {
        setInterval(() => {
            const now = new Date();
            document.getElementById('clockTime').textContent = now.toLocaleTimeString('ja-JP');
            document.getElementById('clockDate').textContent = now.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric', weekday:'short'});
            if(now.getSeconds() === 0) this.renderDashboard();
        }, 1000);
    }
    toggleTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            document.getElementById('pomoStartBtn').textContent = "開始";
        } else {
            document.getElementById('pomoStartBtn').textContent = "停止";
            this.timer = setInterval(() => {
                this.timeLeft--;
                this.updatePomoUI();
                if (this.timeLeft <= 0) { clearInterval(this.timer); alert("休憩！"); }
            }, 1000);
        }
    }
    resetTimer() {
        clearInterval(this.timer);
        this.timer = null;
        this.timeLeft = 25 * 60;
        this.updatePomoUI();
        document.getElementById('pomoStartBtn').textContent = "開始";
    }
    updatePomoUI() {
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        document.getElementById('pomoTime').textContent = `${m}:${s.toString().padStart(2, '0')}`;
        document.getElementById('pomoProgress').style.width = `${((25*60 - this.timeLeft) / (25*60)) * 100}%`;
    }
}
const app = new App();
window.onload = () => app.init();
