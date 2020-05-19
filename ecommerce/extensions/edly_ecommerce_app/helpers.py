from django.conf import settings

import jwt

from opaque_keys.edx.keys import CourseKey


def decode_edly_user_info_cookie(encoded_cookie_data):
    """
    Decode edly_user_info cookie data from JWT string.

    Arguments:
        encoded_cookie_data (dict): Edly user info cookie JWT encoded string.

    Returns:
        dict
    """
    return jwt.decode(encoded_cookie_data, settings.EDLY_COOKIE_SECRET_KEY, algorithms=[settings.EDLY_JWT_ALGORITHM])


def encode_edly_user_info_cookie(cookie_data):
    """
    Encode edly_user_info cookie data into JWT string.

    Arguments:
        cookie_data (dict): Edly user info cookie dict.

    Returns:
        string
    """
    return jwt.encode(cookie_data, settings.EDLY_COOKIE_SECRET_KEY, algorithm=settings.EDLY_JWT_ALGORITHM)


def get_edx_org_from_edly_cookie(encoded_cookie_data):
    """
    Returns "edx-org" value from the "edly-user-info" cookie.

    Arguments:
        encoded_cookie_data (dict): Edly user info cookie JWT encoded string.

    Returns:
        string
    """

    if not encoded_cookie_data:
        return ''

    decoded_cookie_data = decode_edly_user_info_cookie(encoded_cookie_data)
    return decoded_cookie_data.get('edx-org', None)


def is_valid_site_course(course_id, request):
    """
    Validate course ID with "edly-user-info" cookie and partner.

    Arguments:
        course_id (string): Course ID string.
        request (WSGI Request): Django Request object.

    Returns:
        boolean
    """
    partner_short_code = request.site.partner.short_code
    course_key = CourseKey.from_string(course_id)
    edx_org_short_name = get_edx_org_from_edly_cookie(
        request.COOKIES.get(settings.EDLY_USER_INFO_COOKIE_NAME, None)
    )
    # We assume that the "short_code" value of ECOM site partner will always
    # be the same as "short_name" value of its related edx organization in LMS
    if edx_org_short_name and course_key.org == edx_org_short_name and course_key.org == partner_short_code:
        return True

    return False
