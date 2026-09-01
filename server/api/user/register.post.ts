import bcrypt from 'bcrypt'
export default defineEventHandler(async (event) => {
    try {
        const userBody = await readBody(event)
        const db = getDb()

        const insertUser = db.prepare(`
            INSERT INTO users (
                user_name, password
            ) VALUES (
                @user_name, @password
            )
            ON CONFLICT(user_name) DO NOTHING
        `)

        const insertUserInfo = db.prepare(`
            INSERT INTO user_info (
                id, email, nickname
            ) VALUES (
                @id, @email, @nickname
            )
        
        `)

        const findUser = db.prepare('SELECT id FROM users WHERE user_name = ?')

        
        const saveUser = async (userBody: any) => {
            // 这里加密
            const cost = 10
            const { userName: user_name, password } = userBody
            const hashpw = await bcrypt.hash(password, cost)
            if(findUser.get(user_name)) return false;

            const result = insertUser.run({ user_name, password: hashpw})

            if (result.changes === 0) return false  // 冲突被跳过
            insertUserInfo.run({ id: result.lastInsertRowid, email: userBody.email, nickname: userBody.nickname })
            return true
        }

        const result = await saveUser(userBody)

        if(result){
            return { data: '注册成功', code: 200, msg: 'ok' }
        } else {
            return { data: '注册失败', code: 200, msg: 'ok' }   
        }
    } catch (error) {
        return { data: {}, code: 500, msg: String(error) }
    }
})
