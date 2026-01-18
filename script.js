// ▼▼▼ ここを自分のリポジトリ名に変える！ ▼▼▼
const GH_CONFIG = {
    owner: "souta-624",
    repo: "school",   // ← ここを shcool か school か確認して修正
    path: "data.json"
};

const DEFAULT_DATA = {
    timeSettings: [
        { p: 1, s: "08:50", e: "09:40" },
        { p: 2, s: "09:50", e: "10:40" }
    ],
    schedule: {},
    tests: []
};

class App {
    constructor() {
        this.adminData = JSON.parse(JSON.stringify(DEFAULT_DATA));
        this.timeLeft = 25 * 60;
        this.timer = null;
    }

    async init() {
        await this.loadFromGitHub();
        this.setupEvents();
        this.startClock();
        this.renderDashboard();
        // ★初期画面は必ずダッシュボード
        this.navigate('dashboard');
    }

    // --- DB読み込み ---
    async loadFromGitHub() {
        try {
            const url = `https://raw.githubusercontent.com/${GH_CONFIG.owner}/${GH_CONFIG.repo}/main/${GH_CONFIG.path}?t=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) {
                this.adminData = await res.json();
                // データ形式の補正
                if (!this.adminData.tests) this.adminData.tests = [];
            }
        } catch (e) {
            console.log("読み込み失敗、初期値を使います");
        }
    }

    // --- GitHubへ保存 (テスト設定も含む) ---
    async saveToGitHub() {
        const token = document.getElementById('ghToken').value;
        if (!token) return alert("GitHubトークンが必要です！");

        // 管理者画面の入力内容をデータに反映
        const testName = document.getElementById('adminTestName').value;
        const testDate = document.getElementById('adminTestDate').value;
        
        if (testName && testDate) {
            this.adminData.tests = [{ name: testName, date: testDate }];
        }

        const apiUrl = `https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`;
        try {
            // 現在のファイルのSHAを取得
            const getRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}` } });
            const sha = getRes.ok ? (await getRes.json()).sha : null;
            
            // 内容をBase64化してPUT
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(this.adminData, null, 2))));
            
            const res = await fetch(apiUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "Update Test Data", content, sha })
            });

            if (res.ok) {
                alert("保存成功！全員に反映されました。");
                this.renderDashboard(); // 自分の画面も更新
            } else {
                alert("保存失敗。トークンが正しいか確認してください。");
            }
        } catch (e) {
            alert("通信エラーが発生しました");
        }
    }

    setupEvents() {
        // 画面切り替え
        document.getElementById('adminLoginBtn').onclick = () => this.navigate('admin-login');
        
        // ログイン処理
        document.getElementById('adminLoginSubmit').onclick = () => {
            if(document.getElementById('adminPinInput').value === '1234') {
                this.prepareAdminPanel();
                this.navigate('admin');
            } else alert("パスワードが違います");
        };

        // 保存ボタン
        document.getElementById('saveAdminDataBtn').onclick = () => this.saveToGitHub();

        // ポモドーロ
        document.getElementById('pomoStartBtn').onclick = () => this.toggleTimer();
        document.getElementById('pomoResetBtn').onclick = () => this.resetTimer();
    }

    prepareAdminPanel() {
        // 既存のデータを入力欄に入れておく
        if (this.adminData.tests && this.adminData.tests.length > 0) {
            document.getElementById('adminTestName').value = this.adminData.tests[0].name;
            document.getElementById('adminTestDate').value = this.adminData.tests[0].date;
        }
    }

    navigate(viewId) {
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');
    }

    renderDashboard() {
        // テストカウントダウンの表示更新
        const testEl = document.getElementById('testCountdownDisplay');
        if (this.adminData.tests && this.adminData.tests.length > 0) {
            const test = this.adminData.tests[0];
            const today = new Date();
            today.setHours(0,0,0,0);
            const target = new Date(test.date);
            const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
            
            let msg = "";
            if (diff > 0) msg = `あと <span style="font-size:1.5em">${diff}</span> 日`;
            else if (diff === 0) msg = "今日が本番です！";
            else msg = "終了しました";
            
            testEl.innerHTML = `<div style="font-size:0.9em; margin-bottom:5px;">${test.name} まで</div>${msg}`;
        } else {
            testEl.textContent = "予定されているテストはありません";
        }
    }

    startClock() {
        setInterval(() => {
            const now = new Date();
            document.getElementById('clockTime').textContent = now.toLocaleTimeString('ja-JP');
            document.getElementById('clockDate').textContent = now.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric', weekday:'short'});
            // ここに次の授業判定ロジックを追加可能
        }, 1000);
    }

    // --- ポモドーロ機能 ---
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