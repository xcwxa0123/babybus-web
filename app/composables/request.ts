export async function request(path: string, options?: any){
    const { $fetchApi } = useNuxtApp()
    try {
        const response = await $fetchApi(path, options)
        return response
    } catch (error) {
        return { data: {}, code: 401, msg: error }
        // return error
    }
}