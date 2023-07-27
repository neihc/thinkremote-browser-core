

export type OS = "Mac OS" | "iOS" | "Windows" | "Linux" | "Android" | "unknown"
export type Platform = 'desktop' | 'mobile'
export type Browser = 'Opera' | 'IE' | 'Firefox' | 'Safari' | 'Chrome' | 'Edge' | 'unknown'

export function getPlatform() : Platform {
    let os = getOS()
    return (os == 'Android' || os == 'iOS') ? 'mobile' :  'desktop' 
}

export function getOS() : OS {
    let OSName : OS = "unknown";

    if (navigator.userAgent.indexOf("Win") != -1) OSName = "Windows";
    if (navigator.userAgent.indexOf("Mac") != -1) OSName = "Mac OS";
    if (navigator.userAgent.indexOf("Linux") != -1) OSName = "Linux";
    if (navigator.userAgent.indexOf("Android") != -1) OSName = "Android";
    if (navigator.userAgent.indexOf("like Mac") != -1) OSName = "iOS";

    return OSName
}

export function getBrowser(): Browser { 
     if((navigator.userAgent.indexOf("Opera") || navigator.userAgent.indexOf('OPR')) != -1 ) {
        return ('Opera');
    } else if(navigator.userAgent.indexOf("Edg") != -1 ) {
        return ('Edge');
    } else if(navigator.userAgent.indexOf("Chrome") != -1 ) {
        return ('Chrome');
    } else if(navigator.userAgent.indexOf("Safari") != -1) {
        return ('Safari');
    } else if(navigator.userAgent.indexOf("Firefox") != -1 ) {
        return ('Firefox');
    } else if((navigator.userAgent.indexOf("MSIE") != -1 ) || (!!document['documentMode'] == true ))  {//IF IE > 10
        return ('IE'); 
    }  

    return ('unknown');
}