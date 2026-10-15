export async function request(path: string, options?: any){
    const { $fetchApi } = useNuxtApp()
    // 全局幕布 Loading 的在途计数：盖幕期间发出的请求都计入，全部回来后开幕。
    // 平时（没在盖幕）hold() 是空操作，局部查询不会干扰下一次盖幕。
    const gate = useCurtainGate()
    gate.hold()
    try {
        const response = await $fetchApi(path, options)
        return response
    } catch (error) {
        return { data: {}, code: 401, msg: error }
        // return error
    } finally {
        gate.ready()
    }
}