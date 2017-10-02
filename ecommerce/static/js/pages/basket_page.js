define([
    'jquery',
    'underscore',
    'underscore.string',
    'utils/utils',
    'utils/credit_card',
    'utils/key_codes',
    'js-cookie'
],
    function($,
              _,
              _s,
              Utils,
              CreditCardUtils,
              KeyCodes,
              Cookies) {
        'use strict';

        var BasketPage = {
            hideVoucherForm: function() {
                $('#voucher_form_container').hide();
                $('#voucher_form_link').show();
            },

            onFail: function() {
                var message = gettext('Problem occurred during checkout. Please contact support.');
                $('#messages').html(_s.sprintf('<div class="alert alert-error">%s</div>', message));
            },

            onSuccess: function(data) {
                var $form = $('<form>', {
                    class: 'hidden',
                    action: data.payment_page_url,
                    method: 'POST',
                    'accept-method': 'UTF-8'
                });

                _.each(data.payment_form_data, function(value, key) {
                    $('<input>').attr({
                        type: 'hidden',
                        name: key,
                        value: value
                    }).appendTo($form);
                });

                $form.appendTo('body').submit();
            },

            checkoutPayment: function(data) {
                $.ajax({
                    url: '/api/v2/checkout/',
                    method: 'POST',
                    contentType: 'application/json; charset=utf-8',
                    dataType: 'json',
                    headers: {
                        'X-CSRFToken': Cookies.get('ecommerce_csrftoken')
                    },
                    data: JSON.stringify(data),
                    success: BasketPage.onSuccess,
                    error: BasketPage.onFail
                });
            },

            appendCardValidationErrorMsg: function(event, field, msg) {
                event.preventDefault();
                field.find('~.help-block').append('<span>' + msg + '</span>');
                field.focus();
                $('.payment-form').attr('data-has-error', true);
            },

            appendCardHolderValidationErrorMsg: function(field, msg) {
                field.parentsUntil('form-item').find('~.help-block').append(
                    '<span>' + msg + '</span>'
                );
            },

            cardHolderInfoValidation: function(event) {
                var requiredFields = [
                        'input[name=first_name]',
                        'input[name=last_name]',
                        'input[name=city]',
                        'select[name=country]'
                    ],
                    countriesWithRequiredStateAndPostalCodeValues = ['US', 'CA'],
                    experiments = window.experimentVariables || {};
                // Only require address and state if we are not in the hide location fields variation of this experiment
                // https://openedx.atlassian.net/browse/LEARNER-2355
                if (!(experiments && experiments.hide_location_fields)) {
                    requiredFields.push('input[name=address_line1]');
                    if (countriesWithRequiredStateAndPostalCodeValues.indexOf($('select[name=country]').val()) > -1) {
                        requiredFields.push('select[name=state]');
                        requiredFields.push('input[name=postal_code]');
                    }
                }

                _.each(requiredFields, function(field) {
                    if ($(field).val() === '') {
                        event.preventDefault();
                        BasketPage.appendCardHolderValidationErrorMsg($(field), gettext('This field is required'));
                        $('.payment-form').attr('data-has-error', true);
                    }
                });

                // Focus the first element that has an error message.
                $('.help-block > span')
                .first().parentsUntil('fieldset').last()
                .find('input')
                .focus();
            },

            isCardTypeSupported: function(cardType) {
                return $.inArray(cardType, ['amex', 'discover', 'mastercard', 'visa']) > -1;
            },

            cardInfoValidation: function(event) {
                var cardType,
                    // We are adding 1 here because month in js style date-time starts with 0
                    // i.e. 0 for JAN, 1 for FEB etc. However, credit card expiry months start with 1
                    // i.e 1 for JAN, 2 for FEB etc.
                    currentMonth = new Date().getMonth() + 1,
                    currentYear = new Date().getFullYear(),
                    $number = $('#card-number'),
                    $cvn = $('#card-cvn'),
                    $expMonth = $('#card-expiry-month'),
                    $expYear = $('#card-expiry-year'),
                    cardNumber = $number.val(),
                    cvnNumber = $cvn.val(),
                    cardExpiryMonth = $expMonth.val(),
                    cardExpiryYear = $expYear.val();

                cardType = CreditCardUtils.getCreditCardType(cardNumber);

                if (!CreditCardUtils.isValidCardNumber(cardNumber)) {
                    BasketPage.appendCardValidationErrorMsg(event, $number, gettext('Invalid card number'));
                } else if (_.isUndefined(cardType) || !BasketPage.isCardTypeSupported(cardType.name)) {
                    BasketPage.appendCardValidationErrorMsg(event, $number, gettext('Unsupported card type'));
                } else if (cvnNumber.length !== cardType.cvnLength || !Number.isInteger(Number(cvnNumber))) {
                    BasketPage.appendCardValidationErrorMsg(event, $cvn, gettext('Invalid security number'));
                }

                if (!Number.isInteger(Number(cardExpiryMonth)) ||
                    Number(cardExpiryMonth) > 12 || Number(cardExpiryMonth) < 1) {
                    BasketPage.appendCardValidationErrorMsg(event, $expMonth, gettext('Invalid month'));
                } else if (!Number.isInteger(Number(cardExpiryYear)) || Number(cardExpiryYear) < currentYear) {
                    BasketPage.appendCardValidationErrorMsg(event, $expYear, gettext('Invalid year'));
                } else if (Number(cardExpiryMonth) < currentMonth && Number(cardExpiryYear) === currentYear) {
                    BasketPage.appendCardValidationErrorMsg(event, $expMonth, gettext('Card expired'));
                }
            },

            detectCreditCard: function() {
                var card,
                    $input = $('#card-number'),
                    cardNumber = $input.val().replace(/\s+/g, ''),
                    iconPath = '/static/images/credit_cards/';

                if (cardNumber.length > 12) {
                    card = CreditCardUtils.getCreditCardType(cardNumber);

                    if (!CreditCardUtils.isValidCardNumber(cardNumber)) {
                        $('.card-type-icon').attr('src', '').addClass('hidden');
                        return;
                    }

                    if (typeof card !== 'undefined') {
                        $('.card-type-icon').attr(
                            'src',
                            iconPath + card.name + '.png'
                        ).removeClass('hidden');
                        $input.trigger('cardType:detected', {type: card.name});
                    } else {
                        $('.card-type-icon').attr('src', '').addClass('hidden');
                    }
                } else {
                    $('.card-type-icon').attr('src', '').addClass('hidden');
                }
            },

            sdnCheck: function(event) {
                var firstName = $('input[name=first_name]').val(),
                    lastName = $('input[name=last_name]').val(),
                    city = $('input[name=city]').val(),
                    country = $('select[name=country]').val();

                $.ajax({
                    url: '/api/v2/sdn/search/',
                    method: 'POST',
                    contentType: 'application/json; charset=utf-8',
                    dataType: 'json',
                    headers: {
                        'X-CSRFToken': Cookies.get('ecommerce_csrftoken')
                    },
                    data: JSON.stringify({
                        name: _s.sprintf('%s %s', firstName, lastName),
                        city: city,
                        country: country
                    }),
                    async: false,
                    success: function(data) {
                        if (data.hits > 0) {
                            event.preventDefault();
                            Utils.redirect('/payment/sdn/failure/');
                        }
                    }
                });
            },

            showVoucherForm: function() {
                $('#voucher_form_container').show();
                $('#voucher_form_link').hide();
                $('#id_code').focus();
            },

            showCvvTooltip: function() {
                $('#cvvtooltip').show();
                $('#card-cvn-help').attr({
                    'aria-haspopup': 'false',
                    'aria-expanded': 'true'
                });
            },

            hideCvvTooltip: function() {
                $('#cvvtooltip').hide();
                $('#card-cvn-help').attr({
                    'aria-haspopup': 'true',
                    'aria-expanded': 'false'
                });
            },

            toggleCvvTooltip: function() {
                var $cvnHelpButton = $('#card-cvn-help');
                $('#cvvtooltip').toggle();
                $cvnHelpButton.attr({
                    'aria-haspopup': $cvnHelpButton.attr('aria-haspopup') === 'true' ? 'false' : 'true',
                    'aria-expanded': $cvnHelpButton.attr('aria-expanded') === 'true' ? 'false' : 'true'
                });
            },

            addPriceDisclaimer: function() {
                var price = $('#basket-total').find('> .price').text(),
                    countryData = Cookies.getJSON('edx-price-l10n');
                if (countryData && countryData.countryCode !== 'USA') {
                    $('<span>').attr('class', 'price-disclaimer')
                        .text('* This total contains an approximate conversion. You will be charged ' + price + ' USD.')
                        .appendTo('div[aria-labelledby="order-details-region"]');
                }
            },

            formatToLocalPrice: function(priceInUsd) {
                var countryData = Cookies.getJSON('edx-price-l10n');

                // Default to USD when the exchange rate cookie doesn't exist
                if (countryData && countryData.countryCode !== 'USA') {
                    return countryData.symbol + Math.round(priceInUsd * countryData.rate) + ' '
                        + countryData.code + ' *';
                } else {
                    return '$' + priceInUsd;
                }
            },

            generateLocalPriceText: function(usdPriceText) {
                var localPriceText = usdPriceText;
                // Matches on all $ab.cd strings
                usdPriceText.match(/\$[0-9]+\.[0-9]+/g).forEach(function(value) {
                    localPriceText = localPriceText.replace(value, BasketPage.formatToLocalPrice(value.substring(1)));
                });
                return localPriceText;
            },

            translateElementToLocalPrices: function(element) {
                var priceText = element.text(),
                    localPriceText = BasketPage.generateLocalPriceText(priceText);
                if (priceText !== localPriceText) {
                    element.text(localPriceText);
                }
            },

            translateToLocalPrices: function() {
                $('.price').each(function() {
                    BasketPage.translateElementToLocalPrices($(this));
                });

                $('.voucher').each(function() {
                    BasketPage.translateElementToLocalPrices($(this));
                });
            },

            onReady: function() {
                var $paymentButtons = $('.payment-buttons'),
                    basketId = $paymentButtons.data('basket-id');

                BasketPage.addPriceDisclaimer();
                BasketPage.translateToLocalPrices();
                Utils.toogleMobileMenuClickEvent();

                $(document).keyup(function(e) {
                    switch (e.which) {
                    case KeyCodes.Escape:
                        BasketPage.hideCvvTooltip();
                        break;
                    case KeyCodes.Tab:
                        if ($('#card-cvn-help').is(':focus')) {
                            BasketPage.showCvvTooltip();
                        }
                        break;
                    default:
                        break;
                    }
                });

                $('#card-cvn-help').on('click touchstart', function(event) {
                    event.preventDefault();
                    BasketPage.toggleCvvTooltip();
                });

                $('#card-cvn-help').blur(BasketPage.hideCvvTooltip)
                    .hover(BasketPage.showCvvTooltip, BasketPage.hideCvvTooltip);

                $('#voucher_form_link').on('click', function(event) {
                    event.preventDefault();
                    BasketPage.showVoucherForm();
                });

                $('#voucher_form_cancel').on('click', function(event) {
                    event.preventDefault();
                    BasketPage.hideVoucherForm();
                });

                $('select[name=country]').on('change', function() {
                    var country = $('select[name=country]').val(),
                        $inputDiv = $('#div_id_state .controls'),
                        states = {
                            US: {
                                Alabama: 'AL',
                                Alaska: 'AK',
                                American: 'AS',
                                Arizona: 'AZ',
                                Arkansas: 'AR',
                                California: 'CA',
                                Colorado: 'CO',
                                Connecticut: 'CT',
                                Delaware: 'DE',
                                'Dist. of Columbia': 'DC',
                                Florida: 'FL',
                                Georgia: 'GA',
                                Guam: 'GU',
                                Hawaii: 'HI',
                                Idaho: 'ID',
                                Illinois: 'IL',
                                Indiana: 'IN',
                                Iowa: 'IA',
                                Kansas: 'KS',
                                Kentucky: 'KY',
                                Louisiana: 'LA',
                                Maine: 'ME',
                                Maryland: 'MD',
                                'Marshall Islands': 'MH',
                                Massachusetts: 'MA',
                                Michigan: 'MI',
                                Micronesia: 'FM',
                                Minnesota: 'MN',
                                Mississippi: 'MS',
                                Missouri: 'MO',
                                Montana: 'MT',
                                Nebraska: 'NE',
                                Nevada: 'NV',
                                'New Hampshire': 'NH',
                                'New Jersey': 'NJ',
                                'New Mexico': 'NM',
                                'New York': 'NY',
                                'North Carolina': 'NC',
                                'North Dakota': 'ND',
                                'Northern Marianas': 'MP',
                                Ohio: 'OH',
                                Oklahoma: 'OK',
                                Oregon: 'OR',
                                Palau: 'PW',
                                Pennsylvania: 'PA',
                                'Puerto Rico': 'PR',
                                'Rhode Island': 'RI',
                                'South Carolina': 'SC',
                                'South Dakota': 'SD',
                                Tennessee: 'TN',
                                Texas: 'TX',
                                Utah: 'UT',
                                Vermont: 'VT',
                                Virginia: 'VA',
                                'Virgin Islands': 'VI',
                                Washington: 'WA',
                                'West Virginia': 'WV',
                                Wisconsin: 'WI',
                                Wyoming: 'WY'
                            },
                            CA: {
                                Alberta: 'AB',
                                'British Columbia': 'BC',
                                Manitoba: 'MB',
                                'New Brunswick': 'NB',
                                'Newfoundland and Labrador': 'NL',
                                'Northwest Territories': 'NT',
                                'Nova Scotia': 'NS',
                                Nunavut: 'NU',
                                Ontario: 'ON',
                                'Prince Edward Island': 'PE',
                                Quebec: 'QC',
                                Saskatchewan: 'SK',
                                Yukon: 'YT'
                            }
                        },
                        experiments = window.experimentVariables || {},
                        selectorRequired = 'aria-required="true" required',
                        stateSelector = '<select name="state" class="select form-control" id="id_state"';

                    if (country === 'US' || country === 'CA') {
                        $($inputDiv).empty();
                        // Only require state if we are not in the hide location fields variation of this experiment
                        // https://openedx.atlassian.net/browse/LEARNER-2355
                        stateSelector += !(experiments && experiments.hide_location_fields) ? selectorRequired : '';
                        stateSelector += '></select>';
                        $($inputDiv).append(stateSelector);
                        $('#id_state').append($('<option>', {value: '', text: gettext('<Choose state/province>')}));
                        $('#div_id_state').find('label').text(gettext('State/Province (required)'));

                        _.each(states[country], function(value, key) {
                            $('#id_state').append($('<option>', {value: value, text: key}));
                        });
                    } else {
                        $($inputDiv).empty();
                        $('#div_id_state').find('label').text('State/Province');
                        // In order to change the maxlength attribute, the same needs to be changed in the Django form.
                        $($inputDiv).append(
                            '<input class="textinput textInput form-control" id="id_state"' +
                            'maxlength="60" name="state" type="text">'
                        );
                    }
                });

                $('#card-number').on('input', function() {
                    BasketPage.detectCreditCard();
                });

                $('#payment-button').click(function(e) {
                    _.each($('.help-block'), function(errorMsg) {
                        $(errorMsg).empty();  // Clear existing validation error messages.
                    });
                    $('.payment-form').attr('data-has-error', false);
                    if ($('#card-number').val()) {
                        BasketPage.detectCreditCard();
                    }
                    BasketPage.cardInfoValidation(e);
                    BasketPage.cardHolderInfoValidation(e);
                    if ($('input[name=sdn-check]').val() === 'enabled' && !$('.payment-form').data('has-error')) {
                        BasketPage.sdnCheck(e);
                    }
                });

                // NOTE: We only include buttons that have a data-processor-name attribute because we don't want to
                // go through the standard checkout process for some payment methods (e.g. Apple Pay).
                $paymentButtons.find('.payment-button[data-processor-name]').click(function(e) {
                    var $btn = $(e.target),
                        deferred = new $.Deferred(),
                        promise = deferred.promise(),
                        paymentProcessor = $btn.data('processor-name'),
                        data = {
                            basket_id: basketId,
                            payment_processor: paymentProcessor
                        };

                    Utils.disableElementWhileRunning($btn, function() {
                        return promise;
                    });
                    BasketPage.checkoutPayment(data);
                });

                // Increment the quantity field until max
                $('.spinner .btn:first-of-type').on('click', function() {
                    var $btn = $(this),
                        input = $btn.closest('.spinner').find('input'),
                        max = input.attr('max');

                    // Stop if max attribute is defined and value is reached to given max value
                    if (_.isUndefined(max) || parseInt(input.val(), 10) < parseInt(max, 10)) {
                        input.val(parseInt(input.val(), 10) + 1);
                    } else {
                        $btn.next('disabled', true);
                    }
                });

                // Decrement the quantity field until min
                $('.spinner .btn:last-of-type').on('click', function() {
                    var $btn = $(this),
                        input = $btn.closest('.spinner').find('input'),
                        min = input.attr('min');

                    // Stop if min attribute is defined and value is reached to given min value
                    if (_.isUndefined(min) || parseInt(input.val(), 10) > parseInt(min, 10)) {
                        input.val(parseInt(input.val(), 10) - 1);
                    } else {
                        $btn.prev('disabled', true);
                    }
                });
            }
        };

        return BasketPage;
    }
);
