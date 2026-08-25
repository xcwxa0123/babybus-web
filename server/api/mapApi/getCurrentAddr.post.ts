export default defineEventHandler(async event => {
    try {
        const result: string = await busmapApi().getCurrentAddr()
        return result
    } catch (error) {
        return { data: {}, code: 500, msg: String(error) }
    }
})