const SCRIPT_TITLE = "悠洗洗衣";
const $ = new Env(SCRIPT_TITLE);
let xh_config = {
    barkID: process.env.BARK_PUSH,
    preserve: {
        gold: process.env.YOUXI_GOLD_PRESERVE || 9,
        violet: process.env.YOUXI_VIOLET_PRESERVE || 28
    },
    pet: {
        feed: process.env.YOUXI_PET_FEED === 'true' || true,
        foodID: process.env.YOUXI_PET_FOOD_ID || 3
    },
    authorization: process.env.YOUXI_AUTHORIZATION && process.env.YOUXI_AUTHORIZATION.split("@") || [],
    headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.101.76 Safari/537.36",
        "Referer": "https://wechat.ulife.group/"
    }
};
let barkMessage = "", pet = {
    "expeValue": 0,
    "feedStatus": 0,
    "level": 0,
    "levelExpeValue": 0,
    "maxLevel": false,
    "nextFeedTime": "",
    "noviceGuideStatus": 0,
    "pestId": 0,
    "pestVo": "",
    "petsName": "",
    "userId": 0
};
let isLogin = false, userGoldValue = 0, userVioletGoldValue = 0, userCharm = 0, couponCount = 0, noDirty = 0;
let todaySign = false, isCanAirClothes = false, isCanCollectOthers = true, isShelfFull = false, isCanHelpAir = true,
    canFeed = false, petGuideComplete = false, isGreaterThanPreserve = false;
let clothesUnlocks = new Map(), propGiveRecord = new Map(), players = new Map(), tasks = new Map();
let collectIds = [];
!(async () => {
    if (!xh_config.authorization) {
        console.log("【提示】请先填写悠洗的Authorization，可通过环境变量YOUXI_AUTHORIZATION控制");
        return;
    }
    if (process.env.YOUXI_AUTHORIZATION) xh_config.authorization = process.env.YOUXI_AUTHORIZATION.indexOf('@') > -1 ? process.env.YOUXI_AUTHORIZATION.split('@') : [process.env.YOUXI_AUTHORIZATION];
    console.log(`[${$.getTime()}] 读取到 ${xh_config.authorization.length} 个悠洗Authorization`);
    for (const [index, authorization] of xh_config.authorization.entries()) {
        if (authorization) {
            console.log(`\n========== authorization ${index + 1}==========`);
            $.username = "";
            $.dirtyClothesCount = 0;
            $.authorization = authorization;
            await userInfo();   // 获取个人信息
            if (!isLogin) { // 登录状态失效
                barkMessage += `authorization ${index + 1} 已失效...\n`;
                console.log(`[${$.getTime()}] authorization ${index + 1} 已失效...`);
            } else {    // 登录状态有效
                await getMarketUserInfo();  // 获取优惠券
                await $.wait(500);
                /* 签到部分 */
                await userGold();
                await $.wait(500);
                if (!todaySign) await signIn();
                /* 签到部分 */
                /* 悠生活个人板块 */
                await propConvertPageList();
                await $.wait(500);
                if (clothesUnlocks.size !== 0) {
                    for (let [clothesName, clothesId] of clothesUnlocks) {
                        await propUnlock(clothesName, clothesId);
                        await $.wait(500);
                    }
                }
                do {
                    await mySpaceInfo();
                    await $.wait(500);
                    // a. 先回收掉所有的能量
                    if (propGiveRecord.size !== 0) {
                        for (const [propId, propType] of propGiveRecord) {
                            await receiveEnergy(propId, propType);
                            await $.wait(500);
                        }
                    }
                    await mySpaceInfo();
                    await $.wait(500);
                    // b. 回收掉挂在外面的所有衣服
                    while (collectIds.length !== 0) {
                        for (const collectId of collectIds) {
                            await collectClothes(collectId);
                            await $.wait(500);
                        }
                        await mySpaceInfo();
                        await $.wait(500);
                    }
                    await mySpaceInfo();
                    // c. 查看洗衣机状态，有衣服就晾，没有就下一步
                    while (isCanAirClothes) {
                        await airClothes();
                        await $.wait(1000);
                        await mySpaceInfo();
                        await $.wait(1000);
                    }
                    // d. 洗衣机状态为空，有脏衣服就洗，没有就下一步
                    if ($.dirtyClothesCount !== 0) await getDirtyClothesNumber();
                    while ($.dirtyClothesCount !== 0) {
                        await cleanDirtyClothes();
                        await console.log(`[${$.getTime()}][${$.username}] 等待衣服洗好...`);
                        await $.wait(4000);
                        await getDirtyCount();
                        await $.wait(1000);
                        await mySpaceInfo();
                        await $.wait(1000);
                        if (isCanAirClothes) await airClothes();
                    }
                } while (propGiveRecord.size !== 0);
                /* 悠生活个人板块 */
                /* 宠物板块 */
                await myPets();
                await $.wait(1000);
                if (!petGuideComplete) await petsDoneNoviceGuide();
                if (xh_config.pet.feed) {
                    if (canFeed) {
                        if (userGoldValue > xh_config.preserve.gold) {
                            await petsFoodConvertPageList();
                            if (isGreaterThanPreserve) {
                                await petsFoodConvert(xh_config.pet.foodID);
                                await $.wait(500);
                                await myPets(true);
                            }
                        }
                    } else await console.log(`[${$.getTime()}][${$.username}] 宠物当前无需喂养`);
                    await $.wait(1000);
                }
                /* 宠物板块 */
                /* 他人个人空间板块 */
                collectIds = [];
                propGiveRecord.clear();
                await getUserRecommendFriend();
                if (players.size !== 0) {
                    for (const [playerId, playerName] of players) {
                        console.log(`[${$.getTime()}][${$.username}] 处理玩家: ${playerName}[${playerId}]`);
                        await mySpaceInfo(false, playerId);
                        // 0. 不管那么多，先偷了阳光值再说
                        if (propGiveRecord.size !== 0) {
                            for (let [propId, propType] of propGiveRecord) {
                                await receiveEnergy(propId, propType, false, playerId, playerName);
                                await $.wait(500);
                            }
                        }
                        // 1. 回收好友挂出来的衣服(防止等下洗衣服之后没有位置挂)
                        while (collectIds.length !== 0 && isCanCollectOthers) {
                            for (let i = 0; i < collectIds.length; i++) {
                                await collectClothes(collectIds[i], false, playerId, playerName, i);
                                if (!isCanCollectOthers) break;
                                await $.wait(500);
                            }
                            await mySpaceInfo(false, playerId);
                            await $.wait(500);
                        }
                        // 2. 看好友的洗衣机状态，如果里面有衣服，就帮忙晾，没有就下一步
                        while (isCanAirClothes && !isShelfFull && !isCanHelpAir) {
                            await airClothes(false, playerName, playerId);
                            await $.wait(500);
                            await mySpaceInfo(false, playerId);
                            await $.wait(500);
                        }
                        // 3. 此时，洗衣机状态为空，检测是否有脏衣服
                        if ($.dirtyClothesCount !== 0 && !isShelfFull && !isCanHelpAir) await getDirtyClothesNumber(false, playerId, playerName);
                        isShelfFull = false;
                        while ($.dirtyClothesCount !== 0 && !isShelfFull && !isCanHelpAir) {
                            await cleanDirtyClothes(false, playerId, playerName);
                            if (isShelfFull) break;
                            await console.log(`[${$.getTime()}][${$.username}] 等待衣服洗好...`);
                            await $.wait(4000);
                            await getDirtyCount(false, playerId, playerName);
                            await $.wait(500);
                            await mySpaceInfo(false, playerId);
                            await $.wait(500);
                            if (isCanAirClothes) await airClothes(false, playerName, playerId);
                            if (isCanHelpAir || isShelfFull) break;
                            await $.wait(500);
                        }
                        // if (!isCanCollectOthers) break;
                        await $.wait(500);
                        console.log(`[${$.getTime()}][${$.username}] 玩家: ${playerName}[${playerId}] 处理完成`);
                    }
                }
                await console.log(`[${$.getTime()}][${$.username}] 所有玩家处理完成`);
                /* 他人个人空间板块 */
                /* Task Part Start */
                await taskList();
                if (tasks.size !== 0) {
                    for (const [title, id] of tasks) {
                        await taskConvertGold(title, id);
                        await $.wait(500);
                    }
                }
                /* Task Part End */
                await userInfo(true);
            }
        }
        if (xh_config.barkID) {
            console.log(`[${$.getTime()}] 执行结束，正在推送结果...`);
            barkMessage += `\n执行时间: ${$.getTime()}\n执行脚本: youxi.js\n版本代码: 20230911`;
            await sendBark();
        }
        barkMessage = "";
        console.log(`========== authorization ${index + 1}==========`);
    }
})().catch((e) => {
    $.log("", `❌ ${$.name}, 失败! 原因: ${e}!`, "");
}).finally(() => {
    $.done();
});

function userInfo(second = false) {
    return new Promise((resolve) => {
        $.request("post", taskURL("/auth/user/info", `{}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        isLogin = true;
                        let { userName } = data;
                        $.username = userName;
                        let { userGold, userVioletGold } = data;
                        ({ userCharm } = data);
                        userGoldValue = userGold;
                        userVioletGoldValue = userVioletGold;
                        !second ? barkMessage += `[${$.username}]\n` : '';
                        barkMessage += `[${$.username}] 当前黄色阳光值: ${userGoldValue}\n`;
                        barkMessage += `[${$.username}] 当前紫色阳光值: ${userVioletGoldValue}\n`;
                        barkMessage += `[${$.username}] 当前魅力值: ${userCharm}\n`;
                        console.log(`[${$.getTime()}][${$.username}] 当前黄色阳光值: ${userGoldValue}`);
                        console.log(`[${$.getTime()}][${$.username}] 当前紫色阳光值: ${userVioletGoldValue}`);
                        console.log(`[${$.getTime()}][${$.username}] 当前魅力值: ${userCharm}`);
                    } else if (code === 401) {
                        barkMessage += `[${$.username}] 登录失效: ${message}\n`;
                        console.log(`[${$.getTime()}][${$.username}] 登录失效: ${message}`);
                        isLogin = false;
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        isLogin = false;
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function getMarketUserInfo() {
    return new Promise((resolve) => {
        $.request("post", taskURL("/market/user/getMarketUserInfo", `{}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        ({ couponCount } = data);
                        barkMessage += `[${$.username}] 当前优惠券: ${couponCount} 张\n`;
                        console.log(`[${$.getTime()}][${$.username}] 当前优惠券: ${couponCount} 张`);
                    } else if (code === 401) {
                        barkMessage += `[${$.username}] 登录失效: ${message}\n`;
                        console.log(`[${$.getTime()}][${$.username}] 登录失效: ${message}`);
                        isLogin = false;
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function userGold() {
    console.log(`[${$.getTime()}][${$.username}] 正在获取签到状态...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/signintask/userSignGold/userGold", `{}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { toDaySign, continueSign } = data;
                        if (toDaySign === 2) {   // 今天未签到
                            todaySign = false;
                            barkMessage += `[${$.username}] 今天未签到\n`;
                            console.log(`[${$.getTime()}][${$.username}] 今天未签到`);
                        } else if (toDaySign === 1) { // 今天已签到
                            todaySign = true;
                            barkMessage += `[${$.username}] 今天已签到，已连续签到 ${continueSign} 天\n`;
                            console.log(`[${$.getTime()}][${$.username}] 今天已签到，已连续签到 ${continueSign} 天`);
                        } else {
                            barkMessage += `[${$.username}] 获取到其他签到状态\n`;
                            console.log(`[${$.getTime()}][${$.username}] 获取到其他签到状态`);
                            console.log(arguments.callee.name, result);
                        }
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function signIn() {
    console.log(`[${$.getTime()}][${$.username}] 正在签到...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/signintask/userSignGold/signIn", `{}`, "POST", true), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        barkMessage += `[${$.username}] 签到成功\n`;
                        console.log(`[${$.getTime()}][${$.username}] 签到成功`);
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function propConvertPageList() {
    console.log(`[${$.getTime()}][${$.username}] 正在检测衣柜衣服是否可以解锁...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/prop/propConvertPageList", `{"pageNum":1, "pageSize": 1000, "clothesType": 2, "propType": 1, "queryType": 2}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { list } = data;
                        clothesUnlocks.clear();
                        for (let clothes of list) {
                            // clothes.status 0 - 未解锁, 1 - 不知道, 2 - 未启用, 3 - 已启用
                            if (clothes.status === 0) {     // 衣服未解锁
                                let { clothesName } = clothes;
                                if (userCharm >= clothes.userCharm) {   // 当前魅力值可以解锁该衣服
                                    console.log(`[${$.getTime()}][${$.username}] 新衣服: ${clothesName.trim()} 可以解锁了`);
                                    clothesUnlocks.set(clothesName.trim(), clothes.id);
                                }
                            }
                        }
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function propUnlock(propName, propId) {
    console.log(`[${$.getTime()}][${$.username}] 正在解锁衣服: ${propName}[${propId}]...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/prop/unlock", `{"propId": ${propId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        barkMessage += `[${$.username}] 新衣服: ${propName} 解锁成功\n`;
                        console.log(`[${$.getTime()}][${$.username}] 新衣服: ${propName} 解锁成功`);
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function mySpaceInfo(self = true, userId) {
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/mySpaceInfo", self ? `{"sourceType": "h5"}` : `{"userId": ${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { mySpaceInfo: { dirtyClothesCount, userInfo: { washerStatus }, airClothesList } } = data,
                            used = 0;
                        noDirty = dirtyClothesCount === 0;
                        $.dirtyClothesCount = dirtyClothesCount;
                        isCanAirClothes = washerStatus === 1;
                        airClothesList.forEach(v => {
                            let { clothesType } = v;
                            if (clothesType) used++;
                        });
                        collectIds = [];
                        propGiveRecord.clear();
                        airClothesList.forEach(v => {
                            let { valueStatus, ariTime, propGiveRecordId, clothesType } = v;
                            if (valueStatus === 0) {
                                let type;
                                let { valueType } = v;
                                switch (valueType) {
                                    case 1:
                                        type = "黄色阳光值";
                                        break;
                                    case 2:
                                        type = "紫色阳光值";
                                        break;
                                    default:
                                        type = "未知值";
                                }
                                if (ariTime === "0") propGiveRecord.set(propGiveRecordId, type);     // 衣架有能量值收获，ariTime不等于0时需要等待
                            } else if (valueStatus === 1 || clothesType === 1) collectIds.push(propGiveRecordId);
                        });
                    } else if (code === 401) {
                        self ? barkMessage += `[${$.username}] 空间信息获取失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 空间信息获取失败: ${message}`);
                    } else {
                        self ? barkMessage += `[${$.username}] 本次操作失败: ${message}\n` : '';
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function receiveEnergy(propGiveRecordId, type, self = true, userId, userName) {
    self ? console.log(`[${$.getTime()}][${$.username}] 正在收取${type}...`) : console.log(`[${$.getTime()}][${$.username}] 正在偷取好友 ${userName}[${userId}]的${type}...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/receiveEnergy", self ? `{"propGiveRecordId": ${propGiveRecordId}}` : `{"propGiveRecordId": ${propGiveRecordId}, "userId": ${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { surplusValue } = data;
                        self ? barkMessage += `[${$.username}] 成功收获 ${surplusValue} 点 ${type}\n` : '';
                        self ? console.log(`[${$.getTime()}][${$.username}] 成功收获 ${surplusValue} 点 ${type}`) : console.log(`[${$.getTime()}][${$.username}] 成功偷取 ${surplusValue} 点 ${type}`);
                    } else if (code === 401) {
                        self ? barkMessage += `[${$.username}] ${type} 收获失败: ${message}\n` : '';
                        self ? console.log(`[${$.getTime()}][${$.username}] ${type} 收获失败: ${message}`) : console.log(`[${$.getTime()}][${$.username}] ${type} 偷取失败: ${message}`);
                    } else if (code === 0) {
                        self ? barkMessage += `[${$.username}] ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  //  阳光值已经领取完
                    } else if (code === 200027) {
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  //  紫色阳光值仅主人可领取
                    } else {
                        self ? barkMessage += `[${$.username}] 本次操作失败: ${message}\n` : '';
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function collectClothes(propGiveRecordId, self = true, userId, userName, index) {
    if (self) console.log(`[${$.getTime()}][${$.username}] 正在回收衣架 ${index} 晾晒完成的衣服...`);
    else console.log(`[${$.getTime()}][${$.username}] 正在回收好友 ${userName}[${userId}] 衣架 ${index + 1} 晾晒完成的衣服...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/collectClothes", self ? `{"propGiveRecordId": ${propGiveRecordId}}` : `{"propGiveRecordId": ${propGiveRecordId}, "userId": ${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        self ? barkMessage += `[${$.username}] 衣服回收成功\n` : '';
                        self ? console.log(`[${$.getTime()}][${$.username}] 衣服回收成功`) : console.log(`[${$.getTime()}][${$.username}] 衣服回收成功，获得 5 点魅力值`);
                    } else if (code === 20029) {
                        console.log(`[${$.getTime()}][${$.username}] 衣服回收失败，今日收取他人衣服次数达到上限`);
                        isCanCollectOthers = false;
                    } else if (code === 0) {
                        console.log(`[${$.getTime()}][${$.username}] 衣服回收失败，${message}`);   // maybe 阳光值还没有领取不能收入衣柜
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function airClothes(self = true, userName, userId) {
    self ? console.log(`[${$.getTime()}][${$.username}] 正在晾晒衣服...`) : console.log(`[${$.getTime()}][${$.username}] 正在晾晒好友 ${userName}[${userId}]衣服...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/airClothes", self ? `{}` : `{"userId": ${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { replaceLt } = data;
                        self ? barkMessage += `[${$.username}] ${message}, 共: ${replaceLt.length} 件\n` : '';
                        self ? console.log(`[${$.getTime()}][${$.username}] ${message}, 共: ${replaceLt.length} 件`) : console.log(`[${$.getTime()}][${$.username}] 成功帮好友 ${userName}[${userId}]晾晒成功, 共: ${replaceLt.length} 件`);
                    } else if (code === 401) {
                        self ? barkMessage += `[${$.username}] 衣服晾晒失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 衣服晾晒失败: ${message}`);
                    } else if (code === 20011) {
                        self ? barkMessage += `[${$.username}] ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  // 没有衣服要晾晒
                    } else if (code === 20006) {
                        self ? barkMessage += `[${$.username}] ${message}\n` : '';
                        isShelfFull = true;
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  // 衣架晾满了，收取晒干的衣服才可继续清洗晾晒哦~
                    } else if (code === 20021) {
                        isCanHelpAir = false;
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  // 今日帮他人晾晒次数达到上限
                    } else if (code === 20019) {
                        isShelfFull = true;
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  // 晾衣架已满，收取能量后才可晾晒~
                    } else {
                        self ? barkMessage += `[${$.username}] 本次操作失败: ${message}\n` : '';
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function getDirtyClothesNumber(self = true, userId, userName) {
    self ? console.log(`[${$.getTime()}][${$.username}] 正在获取可清洗的脏衣服数量...`) : console.log(`[${$.getTime()}][${$.username}] 正在获取好友 ${userName}[${userId}] 可清洗的脏衣服数量...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/getDirtyClothesNumber", self ? `{}` : `{"userId":${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { cleanClothesLt: { dirtyClothesCount, cleanClothesCount } } = data;
                        $.dirtyClothesCount = dirtyClothesCount;
                        self ? barkMessage += `[${$.username}] 脏衣篮里有 ${$.dirtyClothesCount} 件衣服，本次可清洗 ${cleanClothesCount} 件\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 脏衣篮里有 ${$.dirtyClothesCount} 件衣服，本次可清洗 ${cleanClothesCount} 件`);
                    } else if (code === 401) {
                        self ? barkMessage += `[${$.username}] 脏衣服数量获取失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 脏衣服数量获取失败: ${message}`);
                    } else if (code === 20008) {
                        self ? barkMessage += `[${$.username}] ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);  // 脏衣篮空空如也~
                    } else {
                        self ? barkMessage += `[${$.username}] 本次操作失败: ${message}\n` : '';
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function cleanDirtyClothes(self = true, userId, userName) {
    self ? console.log(`[${$.getTime()}][${$.username}] 正在清洗脏衣服...`) : console.log(`[${$.getTime()}][${$.username}] 正在清洗好友 ${userName}[${userId}] 的脏衣服...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/cleanDirtyClothes", self ? `{}` : `{"userId": ${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        self ? barkMessage += `[${$.username}] ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] ${message}`);
                        self ? barkMessage += `[${$.username}] 5分钟后可收获阳光值...\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 5分钟后可收获阳光值`);
                    } else if (code === 401) {
                        self ? barkMessage += `[${$.username}] 脏衣服清洗失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 脏衣服清洗失败: ${message}`);
                    } else if (code === 20009) {
                        self ? barkMessage += `[${$.username}] 脏衣服清洗失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 脏衣服清洗失败: ${message}`); // 洗衣机工作中，洗衣机衣服未晾晒
                    } else if (code === 20006) {
                        self ? barkMessage += `[${$.username}] 脏衣服清洗失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 脏衣服清洗失败: ${message}`); // 衣架晾满了，收取晒干的衣服才可继续清洗晾晒哦~
                        isShelfFull = true;
                    } else {
                        self ? barkMessage += `[${$.username}] 本次操作失败: ${message}\n` : '';
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function getDirtyCount(self = true, userId, userName) {
    self ? console.log(`[${$.getTime()}][${$.username}] 正在获取剩余脏衣服数量...`) : console.log(`[${$.getTime()}][${$.username}] 正在获取好友 ${userName}[${userId}] 的剩余脏衣服数量...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/getDirtyCount", self ? `{}` : `{"userId": ${userId}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data: { dirtyClothesCount }, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        $.dirtyClothesCount = dirtyClothesCount;
                        self ? barkMessage += `[${$.username}] 当前剩余脏衣服数量为: ${$.dirtyClothesCount}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 当前剩余脏衣服数量为: ${$.dirtyClothesCount}`);
                    } else if (code === 401) {
                        self ? barkMessage += `[${$.username}] 剩余脏衣服数量获取失败: ${message}\n` : '';
                        console.log(`[${$.getTime()}][${$.username}] 剩余脏衣服数量获取失败: ${message}`);
                    } else {
                        self ? barkMessage += `[${$.username}] 本次操作失败: ${message}\n` : '';
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function myPets(again = false) {
    console.log(`[${$.getTime()}][${$.username}] 正在获取宠物信息...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/myPets", `{"sourceType": "h5"}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        pet = data;
                        canFeed = pet.feedStatus === 0;
                        if (pet.noviceGuideStatus === 0) {
                            petGuideComplete = false;
                            console.log(`[${$.getTime()}][${$.username}] 未完成宠物向导...`);
                        } else {
                            petGuideComplete = true;
                            if (again) {
                                barkMessage += `[${$.username}] 宠物等级: ${pet.level}\n`;
                                barkMessage += `[${$.username}] 宠物经验进度: ${pet.expeValue}/${pet.levelExpeValue}\n`;
                            }
                            console.log(`[${$.getTime()}][${$.username}] 宠物等级: ${pet.level}`);
                            console.log(`[${$.getTime()}][${$.username}] 宠物经验进度: ${pet.expeValue}/${pet.levelExpeValue}`);
                        }
                    } else if (code === 401) {
                        barkMessage += `[${$.username}] 宠物信息获取失败: ${message}\n`;
                        console.log(`[${$.getTime()}][${$.username}] 宠物信息获取失败: ${message}`);
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function petsDoneNoviceGuide() {
    console.log(`[${$.getTime()}][${$.username}] 正在完成宠物向导...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/mySpace/petsDoneNoviceGuide", `{}`, "POST", true), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) console.log(`[${$.getTime()}][${$.username}] 宠物向导完成完毕`);
                    else {
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function petsFoodConvertPageList() {
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/petsFood/convertPageList", `{}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        let { list } = data;
                        for (let item of list) {
                            let consumeType = "";
                            let { userGold, userVioletGold, id } = item;
                            if (userGold !== 0) {
                                consumeType = `消耗黄色阳光值: ${userGold} 点`;
                                if (id === xh_config.pet.foodID) {
                                    isGreaterThanPreserve = (userGoldValue - userGold) >= xh_config.preserve.gold;
                                    if (!isGreaterThanPreserve) {   // 如果小于预留值
                                        console.log(`[${$.getTime()}][${$.username}] 喂养后剩余的黄色阳光值小于预留值，不允许喂养`);
                                    } else {
                                        console.log(`[${$.getTime()}][${$.username}] 喂养后剩余的黄色阳光值大于预留值，允许喂养`);
                                        break;
                                    }
                                }
                            } else if (userVioletGold !== 0) consumeType = `消耗紫色阳光值: ${userVioletGold} 点`;
                        }
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function petsFoodConvert(id, expendType = 1) {
    console.log(`[${$.getTime()}][${$.username}] 正在喂养宠物...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/game/petsFood/convert", `{"id": ${id}, "expendType": ${expendType}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        barkMessage += `[${$.username}] 喂养成功\n`;
                        console.log(`[${$.getTime()}][${$.username}] 喂养成功`);
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function getUserRecommendFriend() {
    console.log(`[${$.getTime()}][${$.username}] 正在发现玩家...`);
    return new Promise((resolve) => {
        $.request("get", taskURL("/game/user/getUserRecommendFriend", '', "GET"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        players.clear();
                        data.forEach(friend => players.set(friend.id, friend.userName));
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function taskList() {
    console.log(`[${$.getTime()}][${$.username}] 正在获取任务列表...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/signintask/userTask/taskList", `{}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        console.log(`[${$.getTime()}][${$.username}] 任务列表获取成功，正在分析...`);
                        console.log('==========任务分析Start==========');
                        tasks.clear();
                        for (let i = 0; i < data.length; i++) {
                            if (data[i].gold !== 0) {
                                if (data[i].state === 1) {   // 任务已完成，未领取
                                    barkMessage += `[${$.username}]【${data[i].title}】已完成, 阳光值未领取\n`;
                                    console.log(`[任务分析] 任务:【${data[i].title}】已完成, 阳光值未领取`);
                                    tasks.set(data[i].title, data[i].id);
                                } else if (data[i].state === 2) {   // 任务已完成，已领取
                                    barkMessage += `[${$.username}]【${data[i].title}】已完成, 阳光值已领取\n`;
                                    console.log(`[任务分析] 任务:【${data[i].title}】已完成, 阳光值已领取`);
                                }
                            }
                        }
                        console.log('==========任务分析End==========');
                    } else {
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function taskConvertGold(title, id) {
    console.log(`[${$.getTime()}][${$.username}] 正在领取任务 ${title} 的奖励...`);
    return new Promise((resolve) => {
        $.request("post", taskURL("/signintask/userTask/taskConvertGold", `{"id": ${id}}`, "POST"), (err, resp, result) => {
            try {
                if (safeGet(result)) {
                    let { code, data, message, success } = JSON.parse(result);
                    if (code === 1 || message === "success" || success === true) {
                        barkMessage += `[${$.username}] 领取成功, 获得 ${data} 阳光值\n`;
                        console.log(`[${$.getTime()}][${$.username}] 领取成功, 获得 ${data} 阳光值`);
                    } else if (code === 0) {
                        barkMessage += `[${$.username}] 领取失败: ${message}\n`;
                        console.log(`[${$.getTime()}][${$.username}] 领取失败: ${message}`);
                    } else {
                        barkMessage += `[${$.username}] 本次操作失败: ${message}, ${arguments.callee.name}\n`;
                        console.log(arguments.callee.name, `[${$.getTime()}][${$.username}] 本次操作失败: ${message}`);
                        console.log(arguments.callee.name, result);
                    }
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

/* ============================== */
function sendBark() {
    return new Promise((resolve) => {
        $.request('get', {
            url: `https://api.day.app/${xh_config.barkID}/${SCRIPT_TITLE}/${encodeURIComponent(barkMessage)}`
        }, (err, resp, data) => {
            try {
                if (safeGet(data)) {
                    let { code, message } = JSON.parse(data);
                    console.log(`[${$.getTime()}] Bark通知发送${(code === 200 || message === "success") ? '成功' : '失败'}`);
                }
            } catch (e) {
                console.log(e);
            } finally {
                resolve();
            }
        });
    });
}

function safeGet(data) {
    try {
        if (typeof JSON.parse(data) == "object") return true;
    } catch (e) {
        console.log(e);
        console.log(`返回数据为空，请检查自身设备网络情况`);
        return false;
    }
}

function taskURL(api = "/", body, method = "GET", isApp = false) {
    const url = `https://api.ulife.group${api}`;
    const headers = {
        'User-Agent': isApp ? 'WasherV4-AppStore/8.1.0 (iPhone; iOS 17.0; Scale/3.00)' : xh_config.headers["User-Agent"],
        'Referer': xh_config.headers["Referer"],
        "Authorization": $.authorization
    };
    const options = { url, headers };
    if (method === "POST") {
        options.headers["Content-Type"] = "application/json; charset=UTF-8";
        options.body = body;
    }
    return options;
}

function Env(name, options) {
    return new class {
        constructor(name, options) {
            this.name = name;
            this.logs = [];
            this.logSeparator = "\n";
            this.startTime = Date.now();
            Object.assign(this, options);
            this.log(`🔔${this.name}, 开始!`);
        }

        request(method, options, callback) {
            const got = require('got');
            got[method](options).then(
                response => {
                    const { statusCode, headers, body } = response;
                    callback(null, { status: statusCode, headers, body }, body);
                },
                error => {
                    const { message, response } = error;
                    callback(message, response, response && response.body);
                }
            );
        }

        log(...message) {
            this.logs.push(...message);
            console.log(message.join(this.logSeparator));
        }

        wait(time) {
            return new Promise(resolve => setTimeout(resolve, time));
        }

        done() {
            const endTime = Date.now();
            const duration = (endTime - this.startTime) / 1e3;
            this.log(`🔔${this.name}, 结束! 🕛 ${duration} 秒`);
        }

        getTime() {
            return (new Date(+new Date() + 28800000)).toISOString().replace('T', ' ').substring(0, 19);
        }
    }(name, options);
}
