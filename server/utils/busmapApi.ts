// type kakuyomuApiText = keyof KakuyomuApiClass
class busmapaPI{
    // API_BASE_URL = process.env.API_BASE_URL || 'http://www.yuri.services';
    MAPSC_KEY = useRuntimeConfig().public.mapscKey;
    API_BASE_URL = useRuntimeConfig().public.apiBaseUrl;
    BUS_SEARCH_KEY = useRuntimeConfig().public.busSearchKey;
    // public async getTitleList(): Promise<any>{
    //     return await $fetch(`${this.API_BASE_URL}/implapi/books/list`, { method: 'GET' })
    // }

    public async getBusmapList(city: string, keywords: string): Promise<any>{
        return await $fetch(`https://restapi.amap.com/v3/bus/linename?offset=40&page=1&extensions=all&key=${this.BUS_SEARCH_KEY}&city=${city}&keywords=${keywords}`, { method: 'GET' })
    }
    public async getCurrentAddr(): Promise<any>{
        return await $fetch(`https://restapi.amap.com/v3/ip?key=${this.BUS_SEARCH_KEY}`, { method: 'GET' })
    }
    public async configDistrict(keywords: string, subdistrict: string): Promise<any>{
        return await $fetch(`https://restapi.amap.com/v3/config/district?key=${this.BUS_SEARCH_KEY}&keywords=${keywords}&subdistrict=${subdistrict}&extensions=all`, { method: 'GET' })
    }

}
export default () => {
    return new busmapaPI()
}