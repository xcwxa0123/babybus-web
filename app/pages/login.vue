<template>
    <div class="page-container">
        <!-- LEFT PANEL -->
        <div class="bg-left">
            <div class="left-content">
                <!-- Logo -->
                <div class="left-logo">
                    <div
                        style="font-family:'Noto Serif SC',serif;font-size:24px;font-weight:700;color:var(--ink);letter-spacing:4px;">
                        <span class="logo-dot"></span>宝宝巴适
                    </div>
                    <div
                        style="font-family:'Playfair Display',serif;font-style:italic;font-size:13px;color:var(--ink-light);">
                        Baby · Bus</div>
                </div>

                <!-- Hero -->
                <div class="left-hero">
                    <div class="left-eyebrow">WELCOME BACK</div>
                    <h1 class="left-title">
                        嘻嘻<br>
                        <em>别想动我数据捏</em>
                    </h1>
                    <p class="left-desc">看看就行了，别动我数据。</p>

                    <div class="left-quote">"不是我说凭什么有地铁轨道交通线路图没有公交交通线路图，看不起我们公交车是吧。"</div>

                    <div class="left-stats">
                        <div class="stat-item">
                            <div class="stat-num">12,400+</div>
                            <div class="stat-lbl">收录公交线路</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-num">10</div>
                            <div class="stat-lbl">收录城市</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-num">每日</div>
                            <div class="stat-lbl">实时更新</div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="left-footer">© 2026 宝宝巴适 · 仅供学习交流</div>
            </div>

            <!-- Floating book cards -->
            <div class="book-cards">
                <div class="book-card">
                    <div class="bc-title">线路数据查看</div>
                    <div class="bc-author">list data</div>
                    <div class="bc-bar">
                        <div class="bc-fill" style="width:94%"></div>
                    </div>
                </div>
                <div class="book-card">
                    <div class="bc-title">线路管理</div>
                    <div class="bc-author">manage data</div>
                    <div class="bc-bar">
                        <div class="bc-fill" style="width:78%"></div>
                    </div>
                </div>
                <div class="book-card">
                    <div class="bc-title">线路获取</div>
                    <div class="bc-author">get data from API</div>
                    <div class="bc-bar">
                        <div class="bc-fill" style="width:62%"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- RIGHT PANEL: FORM -->
        <div class="bg-right">
            <div class="form-card">
                <div class="form-header">
                    <div class="form-greeting">SIGN IN</div>
                    <div class="form-title">{{ activeTab === 'login' ? '门禁' : '不给注册捏' }}</div>
                    <div class="form-sub">{{ activeTab === 'login' ? '门禁' : '嘻嘻' }}</div>
                </div>

                <!-- Tabs -->
                <div class="form-tabs">
                    <div class="form-tab" :class="{ active: activeTab === 'login' }" @click="switchTab('login')">登录
                    </div>
                    <div class="form-tab" :class="{ active: activeTab === 'register' }" @click="switchTab('register')">
                        注册
                    </div>
                </div>

                <!-- LOGIN FORM -->
                <transition name="tab-fade" mode="out-in">
                    <div v-if="activeTab === 'login'" key="login">
                        <div class="field-group">
                            <div class="field-label">账号 / 邮箱</div>
                            <el-input v-model="loginForm.userName" placeholder="请输入账号或邮箱" :prefix-icon="userIcon"
                                @keyup.enter="doLogin" />
                            <div class="field-error" v-if="errors.userName">⚠ {{ errors.userName }}</div>
                        </div>
                        <div class="field-group">
                            <!-- <div class="field-label">
                                <span>密码</span>
                                <span class="field-forgot">忘记密码？</span>
                            </div> -->
                            <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" show-password
                                @keyup.enter="doLogin" />
                            <div class="field-error" v-if="errors.password">⚠ {{ errors.password }}</div>
                        </div>
                        <div class="remember-row">
                            <div class="remember-check" @click="remember = !remember">
                                <div class="check-box" :class="{ checked: remember }">{{ remember ? '✓' : '' }}</div>
                                <span>记住我</span>
                            </div>
                        </div>
                        <button class="submit-btn" @click="doLogin" :disabled="loading">
                            <div class="btn-shine"></div>
                            <div class="spin" v-if="loading"></div>
                            <span>{{ loading ? '登录中…' : '登 录' }}</span>
                        </button>

                        <!-- <div class="or-divider">或使用以下方式登录</div>
                        <div class="social-row">
                            <button class="social-btn">🌐 微信登录</button>
                            <button class="social-btn">📱 手机号登录</button>
                        </div> -->
                    </div>

                    <!-- REGISTER FORM -->
                    <div v-else key="register">
                        <div class="field-group">
                            <div class="field-label">用户名</div>
                            <el-input v-model="regForm.userName" placeholder="请输入用户名" :prefix-icon="userIcon" />
                            <div class="field-error" v-if="errors.userName">⚠ {{ errors.userName }}</div>
                        </div>
                        <div class="field-group">
                            <div class="field-label">昵称</div>
                            <el-input v-model="regForm.nickname" placeholder="起一个好听的名字" />
                            <div class="field-error" v-if="errors.nickname">⚠ {{ errors.nickname }}</div>
                        </div>
                        <div class="field-group">
                            <div class="field-label">邮箱</div>
                            <el-input v-model="regForm.email" placeholder="请输入邮箱地址" />
                            <div class="field-error" v-if="errors.email">⚠ {{ errors.email }}</div>
                        </div>
                        <div class="field-group">
                            <div class="field-label">密码</div>
                            <el-input v-model="regForm.password" type="password" placeholder="至少 8 位，含字母和数字"
                                show-password />
                            <div class="field-error" v-if="errors.regPwd">⚠ {{ errors.regPwd }}</div>
                        </div>
                        <div class="field-group" style="margin-bottom:24px">
                            <div class="field-label">确认密码</div>
                            <el-input v-model="regForm.confirm" type="password" placeholder="再次输入密码" show-password
                                @keyup.enter="doRegister" />
                            <div class="field-error" v-if="errors.confirm">⚠ {{ errors.confirm }}</div>
                        </div>
                        <button class="submit-btn" @click="doRegister" :disabled="loading">
                            <div class="btn-shine"></div>
                            <div class="spin" v-if="loading"></div>
                            <span>{{ loading ? '注册中…' : '创建账号' }}</span>
                        </button>
                    </div>
                </transition>

                <div class="form-footer">
                    {{ activeTab === 'login' ? '还没有账号？' : '已有账号？' }}
                    <a @click="switchTab(activeTab === 'login' ? 'register' : 'login')">
                        {{ activeTab === 'login' ? '立即注册' : '去登录' }}
                    </a>
                </div>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
const authStore = useAuthStore();
const activeTab = ref('login');
const loading = ref(false);
const remember = ref(true);

const loginForm = reactive({ userName: '', password: '' });
const regForm = reactive({ nickname: '', email: '', password: '', confirm: '', userName: '' });
const errors: { [x: string]: any } = reactive({});

const userIcon = { render: () => h('span', { style: 'font-size:14px;color:var(--ink-faint)' }, '👤') };

const switchTab = (tab: any) => {
    activeTab.value = tab;
    Object.keys(errors).forEach((k: string) => delete errors[k]);
};

const doLogin = async () => {
    Object.keys(errors).forEach(k => delete errors[k]);
    let ok = true;
    if (!loginForm.userName.trim()) { errors.userName = '请输入账号或邮箱'; ok = false; }
    if (!loginForm.password) { errors.password = '请输入密码'; ok = false; }
    if (!ok) return;

    loading.value = true;
    const res: any = await request('/api/user/login', {
        method: 'POST',
        body: { userName: loginForm.userName, password: loginForm.password }
    })
    if(res.code == 200){
        // token存cookie
        // 查用户信息接口
        authStore.login(res.data.token)
        authStore.setUserInfo(res.data.user)
        ElMessage({ message: '登录成功，正在跳转…', type: 'success', duration: 1200 });
    } else {
        ElMessage({ message: `登录失败捏！${ res.msg }`, type: 'error', duration: 1500 });
    }
    loading.value = false;
};

const doRegister = async () => {
    Object.keys(errors).forEach(k => delete errors[k]);
    let ok = true;
    if (!regForm.userName.trim()) { errors.userName = '用户名不能为空'; ok = false; }
    if (!regForm.nickname.trim()) { errors.nickname = '昵称不能为空'; ok = false; }
    if (!regForm.email.includes('@')) { errors.email = '请输入有效的邮箱地址'; ok = false; }
    if (regForm.password.length < 8) { errors.regPwd = '密码至少需要 8 位'; ok = false; }
    if (regForm.confirm !== regForm.password) { errors.confirm = '两次密码不一致'; ok = false; }
    if (!ok) return;

    loading.value = true;
    
    const res: any = await request('/api/user/register', {
        method: 'POST',
        body: {
            userName: regForm.userName,
            password: regForm.password,
            email: regForm.email,
            nickname: regForm.nickname
        }
    })
    if(res.code == 200){
        ElMessage({ message: '注册成功捏！', type: 'success', duration: 1500 });
        switchTab('login');
        loginForm.userName = regForm.userName;
    } else {
        ElMessage({ message: '现在不允许注册捏！', type: 'error', duration: 1500 });
    }
    loading.value = false;


    // setTimeout(() => {
    // }, 1600);
};
</script>
<style>
.page-container{
    display: flex;
    flex-direction: row;
    /* height: 800px; */
    min-height: 84vh
}
</style>