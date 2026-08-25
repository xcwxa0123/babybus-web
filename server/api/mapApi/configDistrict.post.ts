export default defineEventHandler(async event => {
    const dataBody = await readBody(event)
    try {
        console.log('dataBody===========>', dataBody)
        const result: string = await busmapApi().configDistrict(dataBody.keywords, dataBody.subdistrict)
        return result
    } catch (error) {
        return { data: {}, code: 500, msg: String(error) }
    }
})