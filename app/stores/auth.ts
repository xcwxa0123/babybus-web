import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
    state: () => ({
        userInfo: {
            userName: '',
            nickname: '',
            email: ''
        }
    }),
    actions: {
        login(token: string) {
            useCookie('token').value = token
        },
        logout() {
            useCookie('token').value = null
            this.userInfo = {
                userName: '',
                nickname: '',
                email: ''
            }
        },
        setUserInfo(userInfo: any) {
            this.userInfo = userInfo
        }
    },
});