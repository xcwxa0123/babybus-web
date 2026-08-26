class busmapaPI{
    MAPSC_KEY = useRuntimeConfig().public.mapscKey;
    BUS_SEARCH_KEY = useRuntimeConfig().public.busSearchKey;


    public async getBusmapList(city: string, keywords: string): Promise<any>{
        return await $fetch(`https://restapi.amap.com/v3/bus/linename?offset=99&page=1&extensions=all&key=${this.BUS_SEARCH_KEY}&city=${city}&keywords=${keywords}`, { method: 'GET' })
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