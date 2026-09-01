import jwt from 'jsonwebtoken'
const PUBLIC_PATHS = [
    '/api/user/login',
    // '/api/user/register'
]
const SECRET = useRuntimeConfig().public.jwtSecret as string

export default defineEventHandler((event) => {
    const method = event.method
    const url = getRequestURL(event).pathname

    const isPublic = (
        method === 'GET' ? true : PUBLIC_PATHS.includes(url)
    )
    if(isPublic) return

    const token = getHeader(event, 'Authorization')?.replace('Bearer ', '')
    if(!token) throw createError({ statusCode: 401 })
    try {
        event.context.auth = jwt.verify(token, SECRET)
    } catch (error) {
        throw createError({ statusCode: 401 });
    }
})