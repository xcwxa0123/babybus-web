export default defineNuxtPlugin<any>((nuxtApp) => {
    const fetchApi = $fetch.create({
        onRequest({ options }: { options: any }) {
            const token = useCookie('token').value
            if(token){
                options.headers = {
                    ...options.headers,
                    Authorization: `Bearer ${token}`
                }
            }
        },
        // onResponse(  { response }: { response: any }){
        //     if(response.status === 401){
        //         const authStore = useAuthStore()
        //         authStore.logout()
        //         ElMessage?.({ message: '登录已过期，请重新登录', type: 'error' })
        //         navigateTo('/login')
        //     }
        // },
        onResponseError(errorResponse: { response: any }){
            if(errorResponse.response.status === 401){
                const authStore = useAuthStore()
                authStore.logout()
                ElMessage?.({ message: '登录已过期，请重新登录', type: 'error' })
                navigateTo('/login')
            }
        }
    })
    nuxtApp.provide('fetchApi', fetchApi)
})