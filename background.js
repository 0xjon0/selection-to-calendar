browser.contextMenus.create({	// https://developer.chrome.com/docs/extensions/reference/contextMenus/#method-create
	id: 'add-selection-to-calendar',
	title: 'Send selection to Calendar',
	contexts: ['selection'],
});

browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add-selection-to-calendar") {
		var info = parse_info(info.selectionText, tab);
		console.log(info);
	    var url  = get_calendar_url(info);

		console.log('Sending user to: ' + url);
		browser.windows.create({'url': url, 'type': 'popup'});
	}
});

// Time
// ([0-9]?[0-9][\.:][0-9][0-9])|([0-9]?[0-9]\s?(AM|PM))

// Date
// ([0-9]?[0-9][\.\/][0-9]?[0-9]([\.\/][0-9][0-9][0-9][0-9])?)|(([0-9]?[0-9])[\s\.,]+(oct|october)( [0-9][0-9][0-9][0-9])?)|((oct|october)[\s\.,]+([0-9]?[0-9]))

const months = {
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
};

let month_names = Object.keys(months).join('|');
let ordinals = 'st|nd|rd|th';

let ex_time = new RegExp('(([0-9]?[0-9])([\.:]([0-9][0-9]))?\\s?(AM|PM))|(([0-9]?[0-9])[\.:]([0-9][0-9]))', 'gi');
let ex_date = new RegExp('(([0-9]?[0-9])[\.\/]([0-9]?[0-9])([\.\/]([0-9][0-9][0-9][0-9]))?)|(([0-9]?[0-9])('+ordinals+')?[\\s\.,]+('+month_names+')( [0-9][0-9][0-9][0-9])?)|(('+month_names+')[\\s\.,]+([0-9]?[0-9])('+ordinals+')?)|(today|tomorrow)', 'gi');

function parse_info(text, tab)
{
    text = text.toLowerCase();

    var times = [];
    var dates = [];

    for (groups = []; (groups = ex_time.exec(text)) !== null;) {
        if (groups[1] !== undefined) {
            /* Analog time */
            var hour = (groups[5] !== undefined ? groups[5] : '').toUpperCase() == 'AM' ? groups[2] : (parseInt(groups[2]) + 12).toString();
            var minute = groups[4] == undefined ? '00' : groups[4];
            times.push(`${hour}:${minute}`);
        }
        else if (groups[6] !== undefined) {
            times.push(groups[6]);
        }
    }

    for (groups = []; (groups = ex_date.exec(text)) !== null;) {
        // console.log(`Found ${groups}. Next starts at ${ex_date.lastIndex}.`);
        var day = (new Date).getUTCDate();
        var month = (new Date).getMonth() + 1;
        var year = (new Date).getUTCFullYear();

        if (groups[1] !== undefined) {
            day   = parseInt(groups[2]);
            month = parseInt(groups[3]);
            year  = parseInt(groups[5]);
        }
        else if (groups[6] !== undefined) {
            day   = parseInt(groups[7]);
            month = months[groups[9]];
            if (groups[9] !== undefined) {
                year = parseInt(groups[10]);
            }
        }
        else if (groups[11] !== undefined) {
            month = months[groups[12]];
			day   = parseInt(groups[13]);
        }
		else if (groups[15] !== undefined) {
			var d = new Date();
			if (groups[15] == 'tomorrow') {
				d.setUTCDate(d.getUTCDate() + 1);
			}

			day   = d.getUTCDate();
		}

        dates.push(`${year}-${month}-${day}`);
    }

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
    var dt = new Date(date + ' ' + time);
    return dt.getUTCFullYear().toString() + (dt.getMonth() + 1).toString().padStart(2, "0") + dt.getDate().toString().padStart(2, "0") + "T"
        + dt.getHours().toString().padStart(2, "0") + dt.getMinutes().toString().padStart(2, "0") + dt.getSeconds().toString().padStart(2, "0") + "H";
}

function get_calendar_url(info) {
	if (!('start-time' in info)) {
		info['start-time'] = '00:01';
		info['end-time']   = '23:59';
	}
	else if (!('end-time' in info)) {
		info['end-time'] = info['start-time'];
	}

    var uri = new URI('https://www.google.com/calendar/render');
    uri.search({
        action:   'TEMPLATE',
        text:     info['title'],
        details:  info['webpage'],
        location: info['online'] ? 'online' : '',
        dates:    to_google_time(info['start-date'], info['start-time']) + '/' + to_google_time(info['start-date'], info['end-time'])
    });

    return uri.toString();
}
