import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
const config = useRuntimeConfig()
const SECRET = config.public.jwtSecret as string
export default defineEventHandler(async (event) => {
    try {
        const dataBody = await readBody(event)
        const { userName: user_name, password } = dataBody
        const db = getDb()
        const user: any = db.prepare(`
            SELECT * FROM users u JOIN user_info ui ON u.id = ui.id WHERE u.user_name = ?
        `).get(user_name)
        if(!user){
            return { data: {}, code: 500, msg: '用户名不存在' }
        }
        const flag = await bcrypt.compare(password, user.password)
        if(!flag){
            return { data: {}, code: 500, msg: '密码错误' }
        }
        const token = jwt.sign(
            { id: user.id, userName: user.user_name },
            SECRET,
            { expiresIn: '1d' }
        )

        return { data: { token, user: { userName: user.user_name, nickname: user.nickname, email: user.email} }, code: 200, msg: 'ok' }
    } catch (error) {
        return { data: {}, code: 500, msg: String(error) }
    }
})