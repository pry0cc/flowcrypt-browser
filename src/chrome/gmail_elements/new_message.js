'use strict';

var url_params = get_url_params(['account_email', 'signal_scope']);
var attachments = [];

signal_scope_set(url_params['signal_scope']);

function new_message_close() {
  signal_send('gmail_tab', 'close_new_message');
}

function new_message_encrypt_and_send() {
  var headers = {
    'To': $('#input_to').val(),
    'Subject': $('#input_subject').val(),
  };
  if($('#input_from').length) {
    headers['From'] = $('#input_from').val();
  } else {
    headers['From'] = url_params['account_email'];
  }
  var plaintext = convert_html_tags_to_newlines($('#input_text').html());
  compose_encrypt_and_send(url_params['account_email'], headers['To'], headers['Subject'], plaintext, function(message_text_to_send) {
    gmail_api_message_send(url_params['account_email'], message_text_to_send, headers, attachments, null, function(success, response) {
      if(success) {
        new_message_close();
      } else {
        alert('error sending message, check log');
      }
    });
  });
}

function select_contact() {
  $('#input_to').focus();
  $('#input_to').val($(this).text().trim());
  hide_contacts();
  $('#input_subject').focus();
}

function search_contacts() {
  var query = $(this).val().trim();
  if(query !== '') {
    var found = pubkey_cache_search(query, 6, true);
    if(found.length > 0) {
      var ul_html = '';
      for(var i = 0; i < found.length; i++) {
        ul_html += '<li><i class="fa fa-lock"></i>' + found[i] + '</li>';
      }
      $('#contacts ul').html(ul_html);
      $('#contacts ul li').click(select_contact);
      $('#contacts').css('display', 'block');
    } else {
      hide_contacts();
    }
  } else {
    hide_contacts();
  }
}

function hide_contacts() {
  $('#contacts').css('display', 'none');
}

var uploader = new qq.FineUploader({
  autoUpload: false,
  debug: true,
  element: document.getElementById('fineuploader'),
  button: document.getElementById('fineuploader_button'),
  // dragAndDrop: {
  //   extraDropzones: [document.getElementById('body')]
  // },
  callbacks: {
    onSubmit: function(id) {
      if(!$("#input_to").val()) {
        alert('Please select a recipient before adding attachments.');
        return false;
      }
    },
    onSubmitted: process_new_attachment,
    onCancel: cancel_attachment,
  }
});

function process_new_attachment(id, name) {
  var file = uploader.getFile(id);
  if(file.type !== 'text/plain') {
    uploader.cancel(id);
    alert('For now, only text file attachments are possible. Images and other types of files will be available soon.');
    return;
  }
  var reader = new FileReader();
  reader.onload = (function(f) {
    return function(e) {
      fetch_pubkeys(url_params.account_email, $("#input_to").val(), function(armored_pubkeys) {
        if(armored_pubkeys) {
          encrypt(armored_pubkeys, e.target.result, function(encrypted_file_content) {
            attachments.push({
              filename: f.name,
              type: file.type,
              content: encrypted_file_content,
              secure: true,
              upload_id: id,
            });
          });
        } else {
          attachments.push({
            filename: f.name,
            type: file.type,
            content: e.target.result,
            secure: false,
            upload_id: id,
          });
        }
      });
    };
  })(file);
  reader.readAsBinaryString(file); //todo: readAsArrayBuffer might make more sense for performance
}

function cancel_attachment(id, name) {
  for(var i in attachments) {
    if(attachments[i].upload_id === id) {
      attachments = array_without(attachments, i);
      break;
    }
  }
}

function on_new_message_render() {
  $("#input_to").focus(compose_render_email_neutral);
  $('#input_to').keyup(search_contacts);
  $("#input_to").blur(compose_render_email_secure_or_insecure);
  $('#send_btn').click(prevent(doubleclick(), new_message_encrypt_and_send));
  $('.close_new_message').click(new_message_close);
  $('table#compose').click(hide_contacts);
  $('.bottom .icon.attach').click();
  account_storage_get(url_params['account_email'], ['addresses'], function(storage) {
    if(typeof storage.addresses !== 'undefined' && storage.addresses.length > 1) {
      $('#input_addresses_container').addClass('show_send_from').append('<select id="input_from"></select>');
      for(var i = 0; i < storage.addresses.length; i++) {
        $('#input_from').append('<option value="' + storage.addresses[i] + '">' + storage.addresses[i] + '</option>');
      }
    }
  });
}
on_new_message_render();
