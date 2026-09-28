class busmapaPI{
    MAPSC_KEY = useRuntimeConfig().public.mapscKey;
    BUS_SEARCH_KEY = useRuntimeConfig().public.busSearchKey;

    // 这接口说是最大开到99实际上offset只到50，真的出生啊
    public async getBusmapList(city: string, keywords: string, page: number): Promise<any>{
        return await $fetch(`https://restapi.amap.com/v3/bus/linename?offset=50&page=${page}&extensions=all&key=${this.BUS_SEARCH_KEY}&city=${city}&keywords=${keywords}`, { method: 'GET' })
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