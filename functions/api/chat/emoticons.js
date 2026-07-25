export async function onRequestGet(context) {
    const { env } = context;
    try {
        const chatKV = env.CHATTING_DB;
        if (!chatKV) return Response.json({ success: false, list: [] });
        let raw = await chatKV.get("emoticons");
        if (!raw) {
            // 首次自动写入
            raw = JSON.stringify([
                {"category":"快乐","items":[{"name":"开心","emoticon":"(*^▽^*)"},{"name":"高兴","emoticon":"(≧∇≦)ﾉ"},{"name":"喜悦","emoticon":"O(∩_∩)O"},{"name":"激动","emoticon":"(☆▽☆)"},{"name":"满足","emoticon":"(￣▽￣)"},{"name":"得意","emoticon":"<(￣︶￣)>"},{"name":"愉快","emoticon":"ヽ(✿ﾟ▽ﾟ)ノ"},{"name":"狂喜","emoticon":"٩(๑>◡<๑)۶"},{"name":"幸福","emoticon":"(´▽`ʃ♡ƪ)"},{"name":"窃喜","emoticon":"(*´艸`*)"}]},
                {"category":"悲伤","items":[{"name":"伤心","emoticon":"(╥﹏╥)"},{"name":"大哭","emoticon":"｡ﾟ(ﾟ´Д｀ﾟ)ﾟ｡"},{"name":"委屈","emoticon":"(´;ω;`)"},{"name":"难过","emoticon":"(ಥ_ಥ)"},{"name":"泪奔","emoticon":"┭┮﹏┭┮"},{"name":"沮丧","emoticon":"(。_。)"},{"name":"叹气","emoticon":"(︶︹︺)"},{"name":"心碎","emoticon":"( ˘ ∧ ˘ )"},{"name":"欲哭无泪","emoticon":"(´-ι_-｀)"},{"name":"抽泣","emoticon":"( Ĭ ^ Ĭ )"}]},
                {"category":"愤怒","items":[{"name":"生气","emoticon":"(╬▔皿▔)╯"},{"name":"愤怒","emoticon":"ヽ(#`Д´)ﾉ"},{"name":"抓狂","emoticon":"(╯‵□′)╯︵┻━┻"},{"name":"暴怒","emoticon":"(ꐦ°᷄д°᷅)"},{"name":"不爽","emoticon":"(￣^￣)"},{"name":"怒视","emoticon":"(눈_눈)"},{"name":"气鼓鼓","emoticon":"(｀・ω・´)"},{"name":"爆炸","emoticon":"╰（‵□′）╯"},{"name":"生闷气","emoticon":"(￣へ￣)"}]},
                {"category":"惊讶","items":[{"name":"惊讶","emoticon":"(O_O)"},{"name":"震惊","emoticon":"(ΩДΩ)"},{"name":"吓傻","emoticon":"(ﾟДﾟ≡ﾟдﾟ)!?"},{"name":"呆滞","emoticon":"( ﾟдﾟ)"},{"name":"瞳孔地震","emoticon":"(°ー°〃)"},{"name":"吓一跳","emoticon":"Σ( ° △ °|||)︴"},{"name":"震撼","emoticon":"(⊙_⊙)"},{"name":"懵逼","emoticon":"(O_o)"},{"name":"不可思议","emoticon":"(´⊙ω⊙`)"}]},
                {"category":"疲惫与无奈","items":[{"name":"无语","emoticon":"(=￣ω￣=)"},{"name":"疑惑","emoticon":"(・-・*)?"},{"name":"沉思","emoticon":"(￣～￣)"},{"name":"无奈","emoticon":"╮(╯▽╰)╭"},{"name":"疲惫","emoticon":"(=_=)"},{"name":"困倦","emoticon":"(￣o￣) . z Z"}]},
                {"category":"喜爱与害羞","items":[{"name":"害羞","emoticon":"(///▽///)"},{"name":"脸红","emoticon":"(*´∀`*)"},{"name":"爱慕","emoticon":"(♡˙︶˙♡)"},{"name":"亲亲","emoticon":"( ˘ ³˘)♥"},{"name":"飞吻","emoticon":"(づ￣ 3￣)づ"},{"name":"卖萌","emoticon":"(๑•ᴗ•๑)"}]},
                {"category":"其他互动","items":[{"name":"鄙视","emoticon":"(¬_¬)"},{"name":"祈祷","emoticon":"(｡>人<｡)"},{"name":"加油","emoticon":"(ง •_•)ง"},{"name":"摸头","emoticon":"( ´･･)ﾉ(._.`)"},{"name":"赞赏","emoticon":"(๑•̀ㅂ•́)و✧"}]}
            ]);
            await chatKV.put("emoticons", raw);
        }
        return Response.json({ success: true, list: JSON.parse(raw) });
    } catch (e) {
        return Response.json({ success: false, list: [] });
    }
}