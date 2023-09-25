// URI.js comes from: https://github.com/medialize/URI.js/blob/b655c1b972111ade9f181b02374305942e68e30a/src/URI.js

/* Test text:
20/06
19.00

3rd Oct

June 5, 2023 
25. 06.
3.04.

30.4.2022
30/04/2022

23.00, 1.30 pm, 2 pm, 6.30, 06:45
*/

browser.contextMenus.create({	// https://developer.chrome.com/docs/extensions/reference/contextMenus/#method-create
	id: 'add-selection-to-calendar',
	title: 'Send selection to Calendar',
	contexts: ['selection'],
});

browser.contextMenus.onClicked.addListener((ctx, tab) => {
    if (ctx.menuItemId == "add-selection-to-calendar")
    {
        var info = parse_info(ctx.selectionText, tab);
        
        if (! info['start-date']) {
            // See if it says the name of the day
            console.log(ctx.selectionText, deduce_date(ctx.selectionText));
            var date = deduce_date(ctx.selectionText);
            
            if (date != undefined) {
                info["start-date"] = date;
            }
            else {
                // Otherwise, complain.
                // var alert_code = `alert("No date found in selection.")`;     // Nope, doesnt work.
                // browser.tabs.executeScript({code : alert_code});
                return;
            }
        }
      
        if (!('start-time' in info) || info['start-time'] == undefined) {
            console.log("No start time found. Assuming whole day.");
            info['start-time'] = { hour:  0, minute:  1 };
            info['end-time']   = { hour: 23, minute: 59 };
        }
        else if (!('end-time' in info) || info['end-time'] == undefined) {
            var end = info['start-time'];
            // end.hour += 1;
            info['end-time'] = end;
        }

        console.log(info);

        var url  = get_calendar_url(info, ctx.selectionText);

        console.log('Sending user to: ' + url);
        browser.windows.create({'url': url, 'type': 'popup'});
    }
});

// Time
// ([0-9]?[0-9][\.:][0-9][0-9])|([0-9]?[0-9]\s?(AM|PM))

// Date
// ([0-9]?[0-9][\.\/][0-9]?[0-9]([\.\/][0-9][0-9][0-9][0-9])?)|(([0-9]?[0-9])[\s\.,]+(oct|october)( [0-9][0-9][0-9][0-9])?)|((oct|october)[\s\.,]+([0-9]?[0-9]))

const MONTHS = {
    // English
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,

    // Czech
    "ledna": 1,
    "února": 2,
    "března": 3,
    "dubna": 4,
    "května": 5,
    "června": 6,
    "července": 7,
    "srpna": 8,
    "září": 9,
    "října": 10,
    "listopadu": 11,
    "prosince": 12,
};
let MONTH_NAMES = Object.keys(MONTHS).join('|');

const DAYS = {
    "monday": 1,
    "tuesday": 2,
    "wednesday": 3,
    "thursday": 4,
    "friday": 5,
    "saturday": 6,
    "sunday": 7,
};
let DAY_NAMES = Object.keys(DAYS).join('|');

let ORDINALS = 'st|nd|rd|th';

const DAY = (new Date).getUTCDate();
const MONTH = (new Date).getMonth() + 1;
const YEAR = (new Date).getUTCFullYear();

const date_templates = [
    {
        pat: /(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.(\d{4})?/gi,         // 23.6.2016, 1.6.
        unpack: (match) => { return { year: match[3] ? parseInt(match[3]) : YEAR , month: parseInt(match[2]), day: parseInt(match[1]) }; }
    },
    {
        pat: /(?<!\d)(\d{2})\/((0|1)\d)(\/(\d{4}))?/gi,         // 23/6/2016, 03/06
        unpack: (match) => { return { year: match[4] ? parseInt(match[5]) : YEAR , month: parseInt(match[2]), day: parseInt(match[1]) }; }
    },
    {
        pat: RegExp('([0-9]?[0-9])(\.|'+ORDINALS+')? ('+MONTH_NAMES+')( \d{4})?', 'gi'),         // 12. Oct, 12th Oct 2004
        unpack: (match) => { return { year: match[4] ? parseInt(match[4]) : YEAR , month: MONTHS[match[3]], day: parseInt(match[1]) }; }
    },  // FIXME: Both will match `Oct 12th Oct`. Use `(?<!\$)`?
    {
        pat: RegExp('('+MONTH_NAMES+') ([0-9]?[0-9])(\.|'+ORDINALS+')?,?( \d{4})?', 'gi'),         // Oct 12th, 12th Oct 2004
        unpack: (match) => { return { year: match[4] ? parseInt(match[4]) : YEAR , month: MONTHS[match[1]], day: parseInt(match[2]) }; }
    },
];

const time_templates = [
    {
        pat: /(?<!\d|\.|:)(\d{1,2})\s?(am|pm)/gi,         // 2pm, 2 pm
        unpack: (match) => {
            var hour_add = (match[2] == 'pm' && match[1] != 12) ? 12 : 0;
            return { hour: parseInt(match[1]) + hour_add, minute: 0 };
        }
    },
    {
        pat: /(?<!\d)(\d{1,2})((\.|:)(\d{2}))(\s?(am|pm))?(?!\.|\d)/gi,         // 23.00, 1.30 pm, 6.30, 06:45
        unpack: (match) => {
            var hour_add = (match[6] == 'pm' && match[1] != 12) ? 12 : 0;
            return { hour: parseInt(match[1]) + hour_add, minute: parseInt(match[4]) };
        }
    },
];

function extract_dates(text)
{
    var dates = [];

    for (const templ of date_templates)
    {
        var match;
        while (match = templ.pat.exec(text.toLowerCase()))
        {
            dates.push(templ.unpack(match));
        }
    }
    
    return dates;
}

function extract_times(text)
{
    var times = [];
    
    for (const templ of time_templates)
    {
        var match;
        while (match = templ.pat.exec(text.toLowerCase()))
        {
            times.push(templ.unpack(match));
        }
    }

    return times;
}

function deduce_date(text)
{
    var pat = new RegExp('((on)|(next) )?('+DAY_NAMES+'|today|tomorrow) at', 'gi');

    var match = pat.exec(text.toLowerCase());
    var d = new Date;

    if (match == null) {
        return undefined;
    }

    if (match[4] == 'today') {
    }
    else if (match[4] == 'tomorrow') {
        d.setDate(d.getDate() + 1);
    }
    else if (match[4] == undefined) {
        return undefined;
    }
    else {
        var now_idx = d.getDay();
        var then_idx = DAYS[match[4]];

        if (then_idx < now_idx) {   // If it's a wednesday and the text says 'on wednesday', we assume it's today.
            then_idx += 7;
        }

        d.setDate(d.getDate() + (then_idx - now_idx));
    }

    if (match[3] == 'next') {
        d.setDate(d.getDate() + 7);     // next wednesday as opposed to on wednesday etc.
    }

    return { year: d.getUTCFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function parse_info(text, tab)
{
    var dates = extract_dates(text);
    var times = extract_times(text);

    console.log("dates: ", dates);
    console.log("times: ", times);

    var info = {
        "start-time": times[0],
        "start-date": dates[0],
        "title": tab.title,
        "webpage": tab.url,
		"online": text.includes('online')
    };

    if (times.length >= 2) {
        info["end-time"] = times[1];
    }

    return info;
}

function to_google_time(date, time) {
    var dt = new Date(`${date.year}-${date.month}-${date.day} ${time.hour}:${time.minute}`);
    return dt.getUTCFullYear().toString() + (dt.getMonth() + 1).toString().padStart(2, "0") + dt.getDate().toString().padStart(2, "0") + "T"
        + dt.getHours().toString().padStart(2, "0") + dt.getMinutes().toString().padStart(2, "0") + dt.getSeconds().toString().padStart(2, "0") + "H";
}

function get_calendar_url(info, selection_text) {
    var uri = new URI('https://www.google.com/calendar/render');
    uri.search({
        action:   'TEMPLATE',
        text:     info['title'],
        details:  info['webpage'] + '\n\n' + selection_text,
        location: info['online'] ? 'online' : '',
        dates:    to_google_time(info['start-date'], info['start-time']) + '/' + to_google_time(info['start-date'], info['end-time'])
    });

    return uri.toString();
}
