import contextlib
import copy
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('activate',Path(__file__).with_name('activate-ate-counter.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def source():
    # Mechanical-patch fixture only; never used as a project's complete rules.
    names=', '.join(repr(x) for x in sorted(m.OLD))
    return {'files':[{'name':'firestore.rules','content':"rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents {\nmatch /households/{household} { allow read, write: if false; }\nmatch /cuberoot_apk_clicks_v1/{app}/events/{id} {\nfunction allowedApp() { return app in ["+names+"]; }\nallow get, list: if allowedApp();\nallow create: if allowedApp() && request.resource.data.keys().hasOnly(['app','createdAt','timezone','build']) && request.resource.data.app == app && request.resource.data.createdAt == request.time && request.resource.data.timezone is string && request.resource.data.timezone.size() <= 64 && request.resource.data.build is string && request.resource.data.build.size() <= 18;\nallow update, delete: if false;\n}\n}}\n"}]}


class ActivationTests(unittest.TestCase):
    def test_only_three_literal_names_change_and_repeat_is_idempotent(self):
        old=source();snapshot=copy.deepcopy(old);candidate,changed=m.extend(old)
        self.assertTrue(changed);self.assertEqual(old,snapshot)
        inserted=", 'ate-windows', 'ate-mac', 'ate'"
        self.assertEqual(candidate['files'][0]['content'].replace(inserted,'',1),old['files'][0]['content'])
        same,changed=m.extend(candidate);self.assertFalse(changed);self.assertEqual(same,candidate)

    def test_unknown_or_malformed_live_policy_is_never_overwritten(self):
        old=source()
        variants=[
            old['files'][0]['content'].replace("'marker'","'other'"),
            old['files'][0]['content'].replace("'marker'","'marker', 'marker'"),
            old['files'][0]['content'].replace("'marker'","someFunction()"),
            old['files'][0]['content'].replace('cuberoot_apk_clicks_v1','other_collection'),
            old['files'][0]['content'].replace('allowedApp()','anotherFunction()',1),
        ]
        for content in variants:
            with self.subTest(content=content[-100:]):
                with self.assertRaises(ValueError):m.extend({'files':[{'name':'firestore.rules','content':content}]})

    def exercise(self,fail_counts=False,invalid_source=False,concurrent=False):
        live={'name':'projects/'+m.PROJECT+'/rulesets/original','gets':0}
        old=live['name'];new='projects/'+m.PROJECT+'/rulesets/candidate';sent=[];created={}
        def api(url,body=None,token='',method=None):
            self.assertEqual(token,'test-token-not-to-be-logged')
            path=url.removeprefix(m.RULES)
            if path==m.RELEASE and method=='PATCH':
                sent.append(body['release']['rulesetName']);live['name']=sent[-1];return {}
            if path==m.RELEASE:
                live['gets']+=1
                if concurrent and live['gets']==2:live['name']='projects/'+m.PROJECT+'/rulesets/concurrent'
                return {'rulesetName':live['name']}
            if path==old:return {'source':source()}
            if path==new:return {'source':created['source']}
            if path=='projects/'+m.PROJECT+':test':return {'issues':[{'severity':'ERROR'}]} if invalid_source else {}
            if path=='projects/'+m.PROJECT+'/rulesets':created.update(body);return {'name':new}
            raise AssertionError(path)
        output=io.StringIO()
        with tempfile.TemporaryDirectory() as directory,patch.object(m.subprocess,'run'),patch.object(m.subprocess,'check_output',return_value='test-token-not-to-be-logged'),patch.object(m,'request',side_effect=api),patch.object(m.Path,'home',return_value=Path(directory)),patch.object(m.time,'sleep'),patch.object(m,'public_counts',side_effect=ValueError('denied') if fail_counts else None,return_value={'ate':{'lifetime':0,'today':0}}),contextlib.redirect_stdout(output):
            if fail_counts or invalid_source or concurrent:
                with self.assertRaises(ValueError):m.main()
            else:m.main()
            self.assertEqual(len(list(Path(directory).glob('ate-counter-backup-*.json'))),1)
        self.assertNotIn('test-token-not-to-be-logged',output.getvalue())
        return live,sent,old,new

    def test_success_checks_and_publishes_candidate(self):
        live,sent,old,new=self.exercise();self.assertEqual(sent,[new]);self.assertEqual(live['name'],new)

    def test_failed_permissions_restore_original_rules(self):
        live,sent,old,new=self.exercise(fail_counts=True);self.assertEqual(sent,[new,old]);self.assertEqual(live['name'],old)

    def test_invalid_source_or_concurrent_release_is_not_published(self):
        for kwargs in ({'invalid_source':True},{'concurrent':True}):
            live,sent,old,new=self.exercise(**kwargs);self.assertEqual(sent,[])


if __name__=='__main__':unittest.main()
