// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { apiCall } from '@hfs/shared/api'
import { state, useSnapState } from './state'
import { alertDialog, newDialog } from './dialog'
import { getHFS, hIcon, makeSessionRefresher, srpClientSequence, working,
    HTTP_CONFLICT, HTTP_UNAUTHORIZED,} from './misc'
import { createElement as h, Fragment, useEffect, useRef } from 'react'
import { t, useI18N } from './i18n'
import { reloadList } from './useFetchList'
import { CustomCode } from './components'

async function login(username:string, password:string) {
    const stopWorking = working()
    return srpClientSequence(username, password, apiCall).then(res => {
        stopWorking()
        sessionRefresher(res)
        state.loginRequired = false
        reloadList()
        return res
    }, (err: any) => {
        stopWorking()
        throw Error(err.message === 'trust' ? t('login_untrusted', "Login aborted: server identity cannot be trusted")
            : err.code === HTTP_UNAUTHORIZED ? t('login_bad_credentials', "Invalid credentials")
                : err.code === HTTP_CONFLICT ? t('login_bad_cookies', "Cookies not working - login failed")
                    : t(err.message))
    })
}

const sessionRefresher = makeSessionRefresher(state)
sessionRefresher(getHFS().session)

export function logout(){
    return apiCall('logout', {}, { modal: working }).catch(res => {
        if (res.code !== HTTP_UNAUTHORIZED) // we expect this error code
            throw res
        state.username = ''
        reloadList()
    })
}

export let closeLoginDialog: undefined | (() => void)
let lastPromise: Promise<any>
export async function loginDialog(closable=false) {
    return lastPromise = new Promise(resolve => {
        if (closeLoginDialog)
            return lastPromise
        let going = false
        const { close } = newDialog({
            closable,
            className: 'login-dialog',
            icon: () => hIcon('login'),
            onClose(v) {
                resolve(v)
                closeLoginDialog = undefined
            },
            title: () => h(Fragment, {}, useI18N().t(`Login`)), // this dialog could be displayed before the language has been loaded
            Content() {
                const usrRef = useRef<HTMLInputElement>()
                const pwdRef = useRef<HTMLInputElement>()
                useEffect(() => {
                    setTimeout(() => usrRef.current?.focus()) // setTimeout workarounds problem due to double-mount while in dev
                }, [])
                const {t} = useI18N() // this dialog can be displayed before anything else, accessing protected folder, and needs to be rendered after languages loading
                return h('form', {
                    onSubmit(ev:any) {
                        ev.preventDefault()
                        go()
                    }
                },
                    h(CustomCode, { name: 'beforeLogin' }),
                    h('div', { className: 'field' },
                        h('label', { htmlFor: 'login_username' }, t`Username`),
                        h('input', {
                            ref: usrRef,
                            id: 'login_username',
                            name: 'username',
                            autoComplete: 'username',
                            required: true,
                            onKeyDown
                        }),
                    ),
                    h('div', { className: 'field' },
                        h('label', { htmlFor: 'login_password' }, t`Password`),
                        h('input', {
                            ref: pwdRef,
                            id: 'login_password',
                            name: 'password',
                            type: 'password',
                            autoComplete: 'current-password',
                            required: true,
                            onKeyDown
                        }),
                    ),
                    h('div', { style: { textAlign: 'right' } },
                        h('button', { type: 'submit' }, t`Continue`)),
                )

                function onKeyDown(ev: KeyboardEvent) {
                    const { key } = ev
                    if (key === 'Escape')
                        return close(null)
                    if (key === 'Enter')
                        return go()
                }

                async function go(ev?: Event) {
                    ev?.stopPropagation()
                    const usr = usrRef.current?.value.trim()
                    const pwd = pwdRef.current?.value
                    if (going || !usr || !pwd) return
                    going = true
                    try {
                        const res = await login(usr, pwd)
                        close(true)
                        if (res?.redirect)
                            getHFS().navigate(res.redirect)
                    } catch (err: any) {
                        await alertDialog(err)
                        usrRef.current?.focus()
                    } finally {
                        going = false
                    }
                }

            }
        })
        closeLoginDialog = close
    })
}

export function useAuthorized() {
    const { loginRequired } = useSnapState()
    if (location.hash === '#LOGIN')
        state.loginRequired = true
    useEffect(() => {
        if (!loginRequired)
            return closeLoginDialog?.()
        if (!closeLoginDialog)
            void loginDialog()
    }, [loginRequired])
    return loginRequired ? null : true
}
