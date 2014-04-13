var sha1 = require('sha1');
var xml2js = require('xml2js');
var events = require('events');
var emitter = new events.EventEmitter();
var ejs = require('ejs');
var BufferHelper = require('bufferhelper');

function extend(source, target) {
    for (var prop in target) {
        source[prop] = target[prop];
    }
    return source;
}

function serverError(res, msg) {
    console.log("ServerErrpr:" + msg);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server Error:" + msg);
}

/*!
 * 从微信的提交中提取XML文件
 */
var getMessage = function (stream, callback) {
    var buf = new BufferHelper();
    buf.load(stream, function (err, buf) {
        if (err) {
            return callback(err);
        }
        var xml = buf.toString('utf-8');
        xml2js.parseString(xml, { trim: true }, callback);
    });
};

var WeixinRequetmMgType = ['text', 'image', 'voice', 'video', 'location', 'link', 'event'];

//响应请求内容模板
var responseTemplateStr = ['<xml>',
    '<ToUserName><![CDATA[<%-toUsername%>]]></ToUserName>',
    '<FromUserName><![CDATA[<%-fromUsername%>]]></FromUserName>',
    '<CreateTime><%=createTime%></CreateTime>',
    '<MsgID><%=msgID%></MsgID>',
    '<MsgType><![CDATA[<%=msgType%>]]></MsgType>',
  '<% if (msgType === "news") { %>',
    '<ArticleCount><%=content.length%></ArticleCount>',
    '<Articles>',
    '<% content.forEach(function(item){ %>',
      '<item>',
        '<Title><![CDATA[<%-item.title%>]]></Title>',
        '<Description><![CDATA[<%-item.description%>]]></Description>',
        '<PicUrl><![CDATA[<%-item.picUrl || item.picurl || item.pic %>]]></PicUrl>',
        '<Url><![CDATA[<%-item.url%>]]></Url>',
      '</item>',
    '<% }); %>',
    '</Articles>',
  '<% } else if (msgType === "music") { %>',
    '<Music>',
      '<Title><![CDATA[<%-content.title%>]]></Title>',
      '<Description><![CDATA[<%-content.description%>]]></Description>',
      '<MusicUrl><![CDATA[<%-content.musicUrl || content.url %>]]></MusicUrl>',
      '<HQMusicUrl><![CDATA[<%-content.hqMusicUrl || content.hqUrl %>]]></HQMusicUrl>',
    '</Music>',
  '<% } else if (msgType === "voice") { %>',
    '<Voice>',
      '<MediaId><![CDATA[<%-content.mediaId%>]]></MediaId>',
    '</Voice>',
  '<% } else if (msgType === "image") { %>',
    '<Image>',
      '<MediaId><![CDATA[<%-content.mediaId%>]]></MediaId>',
    '</Image>',
  '<% } else if (msgType === "video") { %>',
    '<Video>',
      '<MediaId><![CDATA[<%-content.mediaId%>]]></MediaId>',
      '<ThumbMediaId><![CDATA[<%-content.thumbMediaId%>]]></ThumbMediaId>',
    '</Video>',
  '<% } else { %>',
    '<Content><![CDATA[<%-content%>]]></Content>',
  '<% } %>',
  '</xml>'].join('');


// 编译过后的模版
var responseTemplate = ejs.compile(responseTemplateStr);


var WeixinRequestHandlerCore = function (token) {
    this.eventListeners = {};
    this.token = token;
};

// 验证
WeixinRequestHandlerCore.prototype.checkSignature = function (req) {

    // 获取校验参数
    this.signature = req.query.signature,
    this.timestamp = req.query.timestamp,
    this.nonce = req.query.nonce,
    this.echostr = req.query.echostr;

    // 按照字典排序
    var array = [this.token, this.timestamp, this.nonce];
    array.sort();

    // 连接
    var str = sha1(array.join(""));

    // 对比签名
    if (str == this.signature) {
        return true;
    } else {
        return false;
    }
};

// ------------------ 监听 ------------------------
//调用方式示例: textMg(function(msg){.....})
WeixinRequetmMgType.forEach(function (msgType) {
    WeixinRequestHandlerCore.prototype[msgType + "Msg"] = function (callback) {
        this.eventListeners[msgType] = callback;
        return this;
    };
});

//将微信发送过来的请求转换为json格式

WeixinRequestHandlerCore.prototype._parseBase = function (reqData) {
    
    var msg = {
        "toUserName": reqData.ToUserName[0],
        "fromUserName": reqData.FromUserName[0],
        "createTime": reqData.CreateTime[0],
        "msgType": reqData.MsgType[0]
    };

    if (reqData.MsgId) {
        msg.msgID = reqData.MsgId[0];
    }

    return msg;
};


WeixinRequestHandlerCore.prototype._parsetextMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "content": reqData.Content[0]
    });

    return msg;
};

WeixinRequestHandlerCore.prototype._parseimageMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "picUrl": reqData.PicUrl[0]
    });

    return msg;
};

WeixinRequestHandlerCore.prototype._parselocationMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "locationX": reqData.Location_X[0],
        "locationY": reqData.Location_Y[0],
        "scale": reqData.Scale[0],
        "label": reqData.Label[0]
    });

    return msg;
};

WeixinRequestHandlerCore.prototype._parselinkMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "title": reqData.Title[0],
        "description": reqData.Description[0],
        "url": reqData.Url[0]
    });

    return msg;
};

WeixinRequestHandlerCore.prototype._parseeventMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "event": reqData.Event[0],
        "eventKey": reqData.EventKey
    });

    return msg;
};

WeixinRequestHandlerCore.prototype._parsevoiceMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "mediaId": reqData.MediaId[0],
        "format": reqData.Format[0],

    });

    return msg;
};

WeixinRequestHandlerCore.prototype._parsevideoMsg = function (reqData) {
    var msg = this._parseBase(reqData);
    msg = extend(msg, {
        "MediaId": reqData.MediaId[0],
        "ThumbMediaId": reqData.ThumbMediaId
    });

    return msg;
};

//发送响应内容,如果没有注册响应事件的话会返回服务器错误
WeixinRequestHandlerCore.prototype._sendResponse = function (eventListenerResult, msgRequest, res) {

    //注册的回调函数中必须指定消息类型
    if (!eventListenerResult.msgType) {
        console.log("请在返回内容中指定消息类型msgType");
        serverError(res,"服务器响应错误");
        return;
    }

    var info = {};

    //这几种信息的回复中content需要是个数组

    if (eventListenerResult.msgType === "voice" || eventListenerResult.msgType === "video"
        || eventListenerResult.msgType === "music" || eventListenerResult.msgType === "news") {

        if (!Array.isArray(eventListenerResult.content)) {
            eventListenerResult.content = [eventListenerResult.content];
        }
    }

    info.content = eventListenerResult.content || '';

    info.msgType = eventListenerResult.msgType;
    info.createTime = new Date().getTime();
    info.toUsername = msgRequest.fromUserName;
    info.fromUsername = msgRequest.toUserName;
    info.msgID = msgRequest.msgId;

    res.writeHead(200);
    res.end(responseTemplate(info));
};

WeixinRequetmMgType.forEach(function (method) {
    WeixinRequestHandlerCore.prototype[method + "Handle"] = function (req,res) {
        var msg = this["_parse" + method + "Msg"](req.data);
        var eventLisener = this.eventListeners[method];
   
        if (typeof eventLisener === "function") {
            var responseMsg = eventLisener(msg, req);
            this._sendResponse(responseMsg, msg, res);
        } else {
            serverError(res,"没有指定响应方法");
        }

    };
});


WeixinRequestHandlerCore.prototype._handleWeixinCall = function (req, res) {
    var method = req.method.toUpperCase();
    var self = this;
    console.log(self);
    //Service url校验方法采用get提交
    if (method === 'GET') {
        if (!this.checkSignature(req)) {
            res.writeHead(401);
            res.end('Invalid signature');
        } else {
            res.writeHead(200);
            res.end(req.query.echostr);
        }
    } else if (method === 'POST') {
        //按照官方要求，此处实际上也需要做token的检验，为方便测试此处暂略
        var msgType = req.data.MsgType[0] ? req.data.MsgType[0] : "text";
        self[msgType + "Handle"](req, res);
    } else {
        res.writeHead(501);
        res.end('Not Implemented');
    }
};

WeixinRequestHandlerCore.prototype.weixinRequestHandler = function() {
    var self = this;
    return function (req, res) {
        getMessage(req, function(err, result) {
            if (err) {
                console.log("error:" + err);
                err.name = 'BadMessage' + err.name;
                serverError(res,err);
            } else {
                if (result) {
                    req.data = result.xml;
                }

                self._handleWeixinCall(req, res);
            }
        });
    };
};

var middleware = function(token) {
    return new WeixinRequestHandlerCore(token);
};

module.exports = middleware;
