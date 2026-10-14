<template>
    <!-- 登录 / 注册单页。
         样式语言与数据页一致：页头复用 index.css 的公共骨架（.page-head / .page-title /
         .page-title-wrap / .page-meta），卡片用 .panel，控件全部走 Element Plus 默认样式
         （EP 主题已在 index.css 里映射到项目令牌，所以天然同色同圆角）。
         旧的「左栏 hero + 浮动卡片 + 自造复选框 + 按钮光效」整套已删。 -->
    <div class="login">
        <div class="page-head">
            <div class="page-title-wrap">
                <h2 class="page-title">
                    <span class="logo-dot"></span>{{ activeTab === 'login' ? '门禁' : '注册' }}
                </h2>
                <span class="logo-en">{{ activeTab === 'login' ? 'Sign in' : 'Sign up' }}</span>
            </div>
            <div class="page-meta">共 {{ total }} 条线路 · {{ adcodeCount }} 个城市</div>
        </div>

        <div class="panel login-panel">
            <div class="login-hint">嘻嘻，看看就行，别动我数据。</div>

            <!-- 登录 -->
            <template v-if="activeTab === 'login'">
                <div class="field-group">
                    <div class="field-label">账号 / 邮箱</div>
                    <el-input v-model="loginForm.userName" placeholder="请输入账号或邮箱" @keyup.enter="doLogin" />
                    <div v-if="errors.userName" class="field-error">{{ errors.userName }}</div>
                </div>

                <div class="field-group">
                    <div class="field-label">密码</div>
                    <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" show-password
                        @keyup.enter="doLogin" />
                    <div v-if="errors.password" class="field-error">{{ errors.password }}</div>
                </div>

                <div class="remember-row">
                    <el-checkbox v-model="remember">记住我</el-checkbox>
                </div>

                <el-button class="submit-btn" type="primary" :loading="loading" @click="doLogin">
                    {{ loading ? '登录中…' : '登 录' }}
                </el-button>
            </template>

            <!-- 注册 -->
            <template v-else>
                <div class="field-group">
                    <div class="field-label">用户名</div>
                    <el-input v-model="regForm.userName" placeholder="请输入用户名" />
                    <div v-if="errors.userName" class="field-error">{{ errors.userName }}</div>
                </div>

                <div class="field-group">
                    <div class="field-label">昵称</div>
                    <el-input v-model="regForm.nickname" placeholder="起一个好听的名字" />
                    <div v-if="errors.nickname" class="field-error">{{ errors.nickname }}</div>
                </div>

                <div class="field-group">
                    <div class="field-label">邮箱</div>
                    <el-input v-model="regForm.email" placeholder="请输入邮箱地址" />
                    <div v-if="errors.email" class="field-error">{{ errors.email }}</div>
                </div>

                <div class="field-group">
                    <div class="field-label">密码</div>
                    <el-input v-model="regForm.password" type="password" placeholder="至少 8 位，含字母和数字"
                        show-password />
                    <div v-if="errors.regPwd" class="field-error">{{ errors.regPwd }}</div>
                </div>

                <div class="field-group">
                    <div class="field-label">确认密码</div>
                    <el-input v-model="regForm.confirm" type="password" placeholder="再次输入密码" show-password
                        @keyup.enter="doRegister" />
                    <div v-if="errors.confirm" class="field-error">{{ errors.confirm }}</div>
                </div>

                <el-button class="submit-btn" type="primary" :loading="loading" @click="doRegister">
                    {{ loading ? '注册中…' : '创建账号' }}
                </el-button>
            </template>

            <div class="login-foot">
                <span>{{ activeTab === 'login' ? '还没有账号？' : '已有账号？' }}</span>
                <!-- <a @click="switchTab(activeTab === 'login' ? 'register' : 'login')">
                    {{ activeTab === 'login' ? '立即注册' : '去登录' }}
                </a> -->
                <a>
                    不给注册
                </a>
            </div>
        </div>

        <div class="stats">
            <div class="stat">
                <b>{{ total }}</b>
                <span>收录公交线路</span>
            </div>
            <div class="stat">
                <b>{{ adcodeCount }}</b>
                <span>收录城市</span>
            </div>
            <div class="stat">
                <b>每日</b>
                <span>实时更新</span>
            </div>
        </div>

        <div class="login-quote">“不是我说凭什么有地铁轨道交通线路图没有公交交通线路图，看不起我们公交车是吧。”</div>
    </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useRouter } from 'vue-router';

const router = useRouter()

const authStore = useAuthStore();
const activeTab = ref('login');
const loading = ref(false);
const remember = ref(true);

const total = ref(0)
const adcodeCount = ref(0)

const loginForm = reactive({ userName: '', password: '' });
const regForm = reactive({ nickname: '', email: '', password: '', confirm: '', userName: '' });
const errors: { [x: string]: any } = reactive({});

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
    if (res.code == 200) {
        // token 存 cookie，再查一次用户信息
        authStore.login(res.data.token)
        authStore.setUserInfo(res.data.user)
        ElMessage({ message: '登录成功，正在跳转…', type: 'success', duration: 1200 });
        router.push({ path: '/' })
    } else {
        ElMessage({ message: `登录失败捏！${res.msg}`, type: 'error', duration: 1500 });
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
    if (res.code == 200) {
        ElMessage({ message: '注册成功捏！', type: 'success', duration: 1500 });
        switchTab('login');
        loginForm.userName = regForm.userName;
    } else {
        ElMessage({ message: '现在不允许注册捏！', type: 'error', duration: 1500 });
    }
    loading.value = false;
};

const setNum = async () => {
    const numRes: any = await request('/api/buslines/getIndexNum', { method: 'GET' })
    if (numRes.code == 200) {
        total.value = numRes.data.total
        adcodeCount.value = numRes.data.adcodeCount
    }
}
setNum()
</script>
