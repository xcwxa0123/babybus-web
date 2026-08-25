class AutoResponseBodyClass {
    protected data: any;
    protected code: number;
    protected msg: string;
    constructor({ data, code, msg }: { data: any, code: number, msg: string }) {
        const { checkedData, checkedCode, checkedMsg } = AutoResponseBodyClass.checkResponse(data, code, msg)
        this.data = checkedData;
        this.code = checkedCode;
        this.msg = checkedMsg;
    }

    protected static checkResponse(data: any, code: number, msg: string){
        switch (code) {
            case 200:
                return { checkedData: data, checkedCode: code, checkedMsg: msg }
        
            default:
                console.log('e=========>', msg)
                return { checkedData: data, checkedCode: 500, checkedMsg: `出现错误，请联系后台人员${msg}` }
        }
    }
    
    public getReponseBody(){
        return { data: this.data, code: this.code, msg: this.msg }
    }
}
export default ({ data, code, msg }: { data: any, code: number, msg: string }) => {
    return new AutoResponseBodyClass({ data, code, msg }).getReponseBody()
}