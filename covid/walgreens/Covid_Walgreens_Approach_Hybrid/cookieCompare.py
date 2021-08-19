import re

def main():

    approachCookies = dict()
    timeslotsCookies = dict()
    # Create a dict for current approach cookies
    try:
        for line in open('Covid_Walgreens_Approach_Hybrid_Cookies.dat', 'r'):
            lineSplit = line.split(',')
            cookie = lineSplit.pop(0)
            key = cookie[0:cookie.find('=')]
            value = cookie[(cookie.find('=')+1):]
            approachCookies.update({key:value})
    except Exception as e:
        print(e)
        print('Failed to parse file')

    # Create a dict for the timeslots requests cookies
    cookies = list()
    try:
        cookieString = ''
        with open('Covid_Walgreens_Research_Timeslots_Cookies.dat', 'r') as fp:
            cookieString = re.sub('[\s+]', '',fp.read())
        cookies = cookieString.split(';')
    except Exception as e:
        print(e)
        print('Failed to parse file')

    for cookie in cookies:
        key = cookie[0:cookie.find('=')]
        value = cookie[(cookie.find('=')+1):]
        timeslotsCookies.update({key:value})
    
    for key in timeslotsCookies.keys():
        if(not approachCookies.get(key)):
            print(f'{key}:{timeslotsCookies.get(key)}')
        else:
            pass
    
    return 0

if __name__ == '__main__':
    main()
