// ▼▼▼ あなたのリポジトリ名に修正してください！ ▼▼▼
const GH_CONFIG = {
    owner: "yoshh1306it-netizen",
    repo: "new-student-dashboard",   // ← 確認！
    path: "data.json"
};

// 初期データ
const DEFAULT_ADMIN_DATA = {
    timeSettings: [
        { p: 1, s: "08:50", e: "09:40" },
        { p: 2, s: "09:50", e: "10:40" },
        { p: 3, s: "10:50", e: "11:40" },
        { p: 4, s: "11:50", e: "12:40" },
        { p: 5, s: "13:30", e: "14:20" },
        { p: 6, s: "14:30", e: "15:20" }
    ],
    // クラスごとの時間割データ (21HR~28HR)
    schedule: {}, 
    tests: []
};

class App {
    constructor() {
        this.adminData = JSON.parse(JSON.stringify(DEFAULT_ADMIN_DATA));
        this.userData = JSON.parse(localStorage.getItem('school_user_settings')) || { 
            classId: '21HR', 
            calendarId: '',
            todos: []
        };
        this.timeLeft = 25 * 60;
        this.timer = null;
        this.editingClass = '21HR'; // 管理者が現在編集中のクラス
    }

    async init() {
        // 全クラス分の初期キーを作成
        for (let i = 1; i <= 8; i++) {
            const c = `2${i}HR`;
            if (!this.adminData.schedule[c]) this.adminData.schedule[c] = { mon:[], tue:[], wed:[], thu:[], fri:[] };
        }

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
                if(data.timeSettings) {
                    this.adminData = data;
                    // データ欠け防止 (新しいクラスが増えた場合など)
                    for (let i = 1; i <= 8; i++) {
                        const c = `2${i}HR`;
                        if (!this.adminData.schedule[c]) this.adminData.schedule[c] = { mon:[], tue:[], wed:[], thu:[], fri:[] };
                    }
                }
            }
        } catch (e) { console.log("初期データを使用"); }
    }

    async saveToGitHub() {
        const token = document.getElementById('ghToken').value;
        if (!token) return alert("GitHubトークンが必要です");

        // テスト設定保存
        const tName = document.getElementById('adminTestName').value;
        const tDate = document.getElementById('adminTestDate').value;
        if (tName && tDate) this.adminData.tests = [{ name: tName, date: tDate }];

        // 現在編集中のクラスの時間割を保存
        this.saveCurrentEditingClassSchedule();

        const apiUrl = `https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`;
        try {
            const getRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}` } });
            const sha = getRes.ok ? (await getRes.json()).sha : null;
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(this.adminData, null, 2))));
            
            const res = await fetch(apiUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "Update Data", content, sha })
            });

            if (res.ok) { alert("保存しました！"); this.renderDashboard(); }
            else alert("保存失敗。トークンを確認してください。");
        } catch (e) { alert("通信エラー"); }
    }

    // --- 管理者画面ロジック ---
    renderAdminScheduleEditor() {
        const container = document.getElementById('adminScheduleEditor');
        container.innerHTML = ''; // クリア
        
        const currentSch = this.adminData.schedule[this.editingClass] || { mon:[], tue:[], wed:[], thu:[], fri:[] };
        const days = { mon:'月', tue:'火', wed:'水', thu:'木', fri:'金' };

        // 曜日ごとに生成
        Object.keys(days).forEach(dayKey => {
            const dayWrapper = document.createElement('div');
            dayWrapper.style.marginBottom = "15px";
            dayWrapper.innerHTML = `<div style="font-weight:bold; border-bottom:1px solid #ddd; margin-bottom:5px;">${days[dayKey]}曜日</div>`;
            
            // 6限分の入力欄
            const subjects = currentSch[dayKey] || [];
            const inputsDiv = document.createElement('div');
            inputsDiv.style.display = 'grid';
            inputsDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
            inputsDiv.style.gap = '5px';

            for(let i=0; i<6; i++) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control';
                input.style.marginBottom = '0';
                input.style.padding = '8px';
                input.style.fontSize = '0.85rem';
                input.placeholder = `${i+1}限`;
                input.value = subjects[i] || "";
                input.dataset.day = dayKey; // データ属性で識別
                input.dataset.period = i;
                inputsDiv.appendChild(input);
            }
            dayWrapper.appendChild(inputsDiv);
            container.appendChild(dayWrapper);
        });
    }

    saveCurrentEditingClassSchedule() {
        // 現在の入力欄からデータを吸い上げて adminData に反映
        const inputs = document.querySelectorAll('#adminScheduleEditor input');
        const newSch = { mon:[], tue:[], wed:[], thu:[], fri:[] };
        
        inputs.forEach(input => {
            const d = input.dataset.day;
            const p = parseInt(input.dataset.period);
            if(!newSch[d]) newSch[d] = [];
            newSch[d][p] = input.value;
        });
        
        this.adminData.schedule[this.editingClass] = newSch;
    }

    setupEvents() {
        // クラスリスト生成 (ユーザー設定用 & 管理者用)
        const userSel = document.getElementById('userClassSelect');
        const adminSel = document.getElementById('adminTargetClass');
        userSel.innerHTML = ""; adminSel.innerHTML = "";

        for (let i = 1; i <= 8; i++) {
            const cls = `2${i}HR`;
            [userSel, adminSel].forEach(sel => {
                const opt = document.createElement('option');
                opt.value = cls; opt.textContent = cls;
                sel.appendChild(opt);
            });
        }

        // 画面遷移
        document.getElementById('adminLoginBtn').onclick = () => this.navigate('admin-login');
        document.getElementById('userSettingsBtn').onclick = () => {
            document.getElementById('userClassSelect').value = this.userData.classId;
            document.getElementById('userCalendarId').value = this.userData.calendarId;
            this.navigate('user-settings');
        };

        // 管理者ログイン
        document.getElementById('adminLoginSubmit').onclick = () => {
            if(document.getElementById('adminPinInput').value === '1234') {
                if(this.adminData.tests[0]) {
                    document.getElementById('adminTestName').value = this.adminData.tests[0].name;
                    document.getElementById('adminTestDate').value = this.adminData.tests[0].date;
                }
                // 初期選択クラスのエディタを表示
                this.editingClass = '21HR'; 
                document.getElementById('adminTargetClass').value = '21HR';
                this.renderAdminScheduleEditor();
                this.navigate('admin');
            } else alert("パスワードが違います");
        };

        // 管理者：編集クラス変更時
        document.getElementById('adminTargetClass').onchange = (e) => {
            // 前のクラスの変更を一時メモリに保存してから切り替え
            this.saveCurrentEditingClassSchedule();
            this.editingClass = e.target.value;
            this.renderAdminScheduleEditor(); // 新しいクラスのデータを表示
        };

        document.getElementById('saveAdminDataBtn').onclick = () => this.saveToGitHub();
        
        // ユーザー設定保存
        document.getElementById('saveUserSettingsBtn').onclick = () => {
            this.userData.classId = document.getElementById('userClassSelect').value;
            this.userData.calendarId = document.getElementById('userCalendarId').value;
            localStorage.setItem('school_user_settings', JSON.stringify(this.userData));
            alert("設定を保存しました");
            this.renderDashboard();
            this.navigate('dashboard');
        };

        // ToDo & Pomodoro
        document.getElementById('addTodoBtn').onclick = () => this.addTodo();
        document.getElementById('pomoStartBtn').onclick = () => this.toggleTimer();
        document.getElementById('pomoResetBtn').onclick = () => this.resetTimer();
    }

    renderDashboard() {
        document.getElementById('displayClassName').textContent = this.userData.classId;
        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const todayKey = dayMap[new Date().getDay()];
        
        // クラスごとの時間割を取得
        const classSch = this.adminData.schedule[this.userData.classId] || {};
        const todaySubs = classSch[todayKey] || [];

        // リスト描画
        const listEl = document.getElementById('scheduleList');
        if (todaySubs.length > 0) {
            let html = '<ul style="list-style:none; padding:0; margin:0;">';
            todaySubs.forEach((sub, i) => {
                if(!sub) sub = "-";
                html += `<li style="padding:8px 0; border-bottom:1px solid #f0f0f0; display:flex; align-items:center;">
                            <span style="width:30px; color:#b2bec3; font-weight:bold; font-size:0.9rem;">${i+1}</span>
                            <span style="font-weight:500;">${sub}</span>
                         </li>`;
            });
            listEl.innerHTML = html + '</ul>';
        } else {
            listEl.innerHTML = '<p style="color:#aaa;">今日の授業はありません</p>';
        }

        // 次の授業 & テスト & カレンダー
        this.updateNextClass(todaySubs);
        this.updateTestCard();
        this.updateCalendar();
    }

    updateNextClass(todaySubs) {
        if (!todaySubs.length) { document.getElementById('nextClassDisplay').textContent = "休日です"; return; }
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        let found = false;

        // 共通の時間設定 (timeSettings) を使用
        for (let i = 0; i < this.adminData.timeSettings.length; i++) {
            const t = this.adminData.timeSettings[i];
            const [sH, sM] = t.s.split(':').map(Number);
            const [eH, eM] = t.e.split(':').map(Number);
            const sMin = sH * 60 + sM;
            const eMin = eH * 60 + eM;

            if (nowM >= sMin && nowM <= eMin) {
                const sub = todaySubs[t.p - 1] || "空き";
                document.getElementById('nextClassDisplay').innerHTML = 
                    `<span style="color:var(--primary); font-weight:bold; font-size:1.4rem;">${sub}</span>
                     <div style="font-size:0.85rem; margin-top:5px; color:#636e72;">${t.p}限目 (あと${eMin - nowM}分)</div>`;
                found = true; break;
            }
            if (nowM < sMin) {
                const sub = todaySubs[t.p - 1] || "空き";
                document.getElementById('nextClassDisplay').innerHTML = 
                    `<span style="font-weight:bold;">次は ${sub}</span>
                     <div style="font-size:0.85rem; margin-top:5px; color:#636e72;">${t.s} 開始 (${t.p}限)</div>`;
                found = true; break;
            }
        }
        if (!found) document.getElementById('nextClassDisplay').textContent = "本日の授業は終了";
    }

    updateTestCard() {
        const el = document.getElementById('testCountdownDisplay');
        if (this.adminData.tests && this.adminData.tests[0]) {
            const t = this.adminData.tests[0];
            const diff = Math.ceil((new Date(t.date) - new Date()) / 86400000);
            const msg = diff > 0 ? `あと <span style="font-size:1.8em; font-weight:bold;">${diff}</span> 日` : (diff === 0 ? "本日！" : "終了");
            el.innerHTML = `<div style="font-size:0.9em; margin-bottom:5px;">${t.name} まで</div>${msg}`;
        } else { el.textContent = "予定なし"; }
    }

    updateCalendar() {
        const calId = this.userData.calendarId || 'japanese__ja@holiday.calendar.google.com';
        const src = `https://calendar.google.com/calendar/embed?height=400&wkst=1&bgcolor=%23ffffff&ctz=Asia%2FTokyo&showTitle=0&src=${encodeURIComponent(calId)}&color=%237986CB`;
        document.getElementById('googleCalendarFrame').src = src;
    }

    // --- その他 (ToDo/Timer/Clock) ---
    // (以前と同じロジックのため省略せず記述)
    renderTodos() {
        const list = document.getElementById('todoList');
        list.innerHTML = "";
        let c = 0;
        this.userData.todos.forEach((t, i) => {
            if(t.done) c++;
            const li = document.createElement('li');
            li.className = `todo-item ${t.done?'done':''}`;
            li.innerHTML = `<input type="checkbox" ${t.done?'checked':''} onchange="app.toggleTodo(${i})">
                            <span>${t.text}</span>
                            <button class="btn-del-todo" onclick="app.delTodo(${i})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(li);
        });
        document.getElementById('todoCount').textContent = `${c}/${this.userData.todos.length}`;
        document.getElementById('todoProgressBar').style.width = this.userData.todos.length ? `${(c/this.userData.todos.length)*100}%` : '0%';
    }
    addTodo() {
        const v = document.getElementById('newTodoInput').value.trim();
        if(v) { this.userData.todos.push({text:v, done:false}); this.saveLocal(); document.getElementById('newTodoInput').value=""; this.renderTodos(); }
    }
    toggleTodo(i) { this.userData.todos[i].done = !this.userData.todos[i].done; this.saveLocal(); this.renderTodos(); }
    delTodo(i) { this.userData.todos.splice(i,1); this.saveLocal(); this.renderTodos(); }
    saveLocal() { localStorage.setItem('school_user_settings', JSON.stringify(this.userData)); }
    
    navigate(id) {
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${id}`).classList.add('active');
    }
    startClock() {
        setInterval(() => {
            const n = new Date();
            document.getElementById('clockTime').textContent = n.toLocaleTimeString('ja-JP');
            document.getElementById('clockDate').textContent = n.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric', weekday:'short'});
            if(n.getSeconds()===0) this.renderDashboard();
        }, 1000);
    }
    toggleTimer() {
        if(this.timer) { clearInterval(this.timer); this.timer=null; document.getElementById('pomoStartBtn').textContent="開始"; }
        else {
            document.getElementById('pomoStartBtn').textContent="停止";
            this.timer = setInterval(()=>{
                this.timeLeft--;
                const m=Math.floor(this.timeLeft/60), s=this.timeLeft%60;
                document.getElementById('pomoTime').textContent = `${m}:${s.toString().padStart(2,'0')}`;
                document.getElementById('pomoProgress').style.width = `${((1500-this.timeLeft)/1500)*100}%`;
                if(this.timeLeft<=0) { clearInterval(this.timer); alert("終了！"); }
            },1000);
        }
    }
    resetTimer() { clearInterval(this.timer); this.timer=null; this.timeLeft=1500; document.getElementById('pomoTime').textContent="25:00"; document.getElementById('pomoProgress').style.width="0%"; document.getElementById('pomoStartBtn').textContent="開始"; }
}

const app = new App();
window.onload = () => app.init();

