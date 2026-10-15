import { defineStore } from "pinia";

// setup 式：userInfo 直接以 cookie 为 source of truth——
// 之前的 options 式把它存在内存里，刷新就丢，header 的昵称显示没法恢复。
// useCookie 自动做 JSON 序列化/反序列化，与 token 同为会话级 cookie。
export const useAuthStore = defineStore("auth", () => {
    const token = useCookie<string | null>("token")
    const userInfo = useCookie<any>("userInfo")

    function login(t: string) {
        token.value = t
    }

    function setUserInfo(u: any) {
        userInfo.value = u
    }

    function logout() {
        token.value = null
        userInfo.value = null
    }

    return { token, userInfo, login, setUserInfo, logout }
});